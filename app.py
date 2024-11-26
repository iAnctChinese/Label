from flask import Flask, request, jsonify
from zhipuai import ZhipuAI
from flask_cors import CORS
import json
app = Flask(__name__)

# 初始化 Flask 应用
app = Flask(__name__)
CORS(app) 
# 初始化 ZhipuAI 客户端
API_KEY = "24a463e3442c20746ae8574b5d6f86a7.DbjlsnN5MUX7RZUQ"  # 替换为你的实际 API Key
client = ZhipuAI(api_key=API_KEY)

def merge_overlapping_entities(entities_dict, text):
    """
    处理重叠和嵌套实体，优先保留较长的实体
    """
    # 将所有实体转换为(start, end, text, category)格式
    all_entities = []
    for category, entity_list in entities_dict.items():
        for entity in entity_list:
            # 找出文本中所有该实体的位置
            start = 0
            while True:
                start = text.find(entity, start)
                if start == -1:
                    break
                all_entities.append({
                    'start': start,
                    'end': start + len(entity),
                    'text': entity,
                    'category': category,
                    'length': len(entity)  # 添加长度属性
                })
                start += 1

    # 按长度降序排序
    all_entities.sort(key=lambda x: -x['length'])

    # 移除被嵌套的实体
    filtered_entities = []
    for i, entity in enumerate(all_entities):
        is_nested = False
        entity_range = range(entity['start'], entity['end'])
        
        # 检查是否被其他实体包含
        for other_entity in filtered_entities:
            other_range = range(other_entity['start'], other_entity['end'])
            
            # 检查是否存在嵌套关系
            if (entity['start'] >= other_entity['start'] and entity['end'] <= other_entity['end']) or \
               (entity['start'] <= other_entity['start'] and entity['end'] >= other_entity['end']):
                # 如果存在嵌套，保留较长的实体
                if entity['length'] > other_entity['length']:
                    filtered_entities.remove(other_entity)
                else:
                    is_nested = True
                break
            
            # 检查是否存在部分重叠
            elif (entity['start'] < other_entity['end'] and entity['end'] > other_entity['start']):
                # 对于部分重叠的情况，保留较长的实体
                if entity['length'] > other_entity['length']:
                    filtered_entities.remove(other_entity)
                else:
                    is_nested = True
                break
        
        if not is_nested:
            filtered_entities.append(entity)

    # 重新组织为原始格式
    result = {
        '人名': [],
        '地名': [],
        '时间': [],
        '职官': [],
        '书名': []
    }
    
    # 按照在文本中的位置排序
    filtered_entities.sort(key=lambda x: x['start'])
    
    for entity in filtered_entities:
        result[entity['category']].append(entity['text'])

    # 去重
    for category in result:
        result[category] = list(set(result[category]))

    return result

@app.route('/ner', methods=['POST'])
def ner():
    try:
        data = request.get_json()
        text = data.get("text")
        if not text:
            return jsonify({"error": "Text input is required"}), 400

        response = client.chat.completions.create(
            model="glm-4",
            messages=[
                {"role": "user", "content": f"请提取以下文本中的命名实体：{text}"},
                {"role": "assistant", "content": "好的，请告诉我您需要的实体分类。"},
                {"role": "user", "content": """
                需要人名、地名、时间、职官、书名。
                请严格按照以下JSON格式输出，不要添加任何其他字符：
                {
                    "人名": [],
                    "地名": [],
                    "时间": [],
                    "职官": [],
                    "书名": []
                }
                只输出JSON，不要任何解释说明。
                """}
            ]
        )

        raw_result = response.choices[0].message.content
        
        # 清理JSON字符串
        raw_result = raw_result.strip()
        raw_result = raw_result.replace('\n', '')
        raw_result = raw_result.replace('\\', '')
        raw_result = raw_result.replace('"{', '{').replace('}"', '}')
        raw_result = raw_result.replace('>"', '"').replace('">','"')  # 处理错误的引号
        
        # 提取JSON部分
        start_index = raw_result.find("{")
        end_index = raw_result.rfind("}")
        if start_index == -1 or end_index == -1:
            return jsonify({"error": "Invalid response format from GLM-4"}), 500

        json_content = raw_result[start_index:end_index + 1]
        
        try:
            entities = json.loads(json_content)
        except json.JSONDecodeError as e:
            print(f"JSON解析错误，原始内容：{json_content}")
            return jsonify({"error": "Invalid JSON format"}), 500

        # 验证和清理实体数据
        cleaned_entities = {
            '人名': [],
            '地名': [],
            '时间': [],
            '职官': [],
            '书名': []
        }
        
        for category in cleaned_entities.keys():
            if category in entities:
                # 清理每个实体字符串
                cleaned_entities[category] = [
                    str(entity).strip().replace('"', '').replace('>', '')
                    for entity in entities[category]
                    if entity and isinstance(entity, (str, int, float))
                ]

        # 处理重叠实体
        processed_entities = merge_overlapping_entities(cleaned_entities, text)
        
        return jsonify({"entities": processed_entities}), 200

    except Exception as e:
        print(f"Error in NER: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/extract_relations', methods=['POST'])
def extract_relations():
    try:
        data = request.get_json()
        text = data.get("text")
        entities = data.get("entities")
        
        if not text or not entities:
            return jsonify({"error": "Text and entities are required"}), 400
        
        # 构建提示词
        prompt = f"""
        请分析以下文本中实体之间的关系：
        
        文本：{text}
        
        已识别的实体：{json.dumps(entities, ensure_ascii=False)}
        
        请严格按照以下JSON格式输出关系：
        {{
            "relations": [
                {{
                    "source": "实体1",
                    "target": "实体2",
                    "relation": "关系类型"
                }}
            ]
        }}
        
        关系类型包括但不限于：任职于、父子、著作、时间发生
        只输出JSON格式，不要其他解释
        """
        
        response = client.chat.completions.create(
            model="glm-4",
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        
        result = response.choices[0].message.content
        
        # 提取JSON部分
        start_index = result.find("{")
        end_index = result.rfind("}")
        if start_index == -1 or end_index == -1:
            return jsonify({"error": "Invalid response format"}), 500
            
        json_content = result[start_index:end_index + 1]
        relations_data = json.loads(json_content)
        
        # 确保返回的数据格式正确
        if not isinstance(relations_data, dict) or 'relations' not in relations_data:
            return jsonify({"error": "Invalid response structure"}), 500
            
        return jsonify(relations_data)
        
    except json.JSONDecodeError as e:
        return jsonify({"error": f"JSON parsing error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500

# 启动服务
if __name__ == '__main__':
    app.run(debug=True)
