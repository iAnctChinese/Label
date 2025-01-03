from flask import Flask, request, jsonify, session
from zhipuai import ZhipuAI
from flask_cors import CORS
import json
import sqlite3
from database import init_db, get_db
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import jwt
import os

# 初始化 Flask 应用
app = Flask(__name__)
CORS(app, supports_credentials=True)
app.secret_key = os.urandom(24)  # 用于session加密
JWT_SECRET = "your-secret-key"  # JWT密钥
# 初始化 ZhipuAI 客户端
API_KEY = "c521ed99726c53c5007df0e48f7e9af6.8vEDNOcCGq64QYdG"  # 替换为你的实际 API Key
client = ZhipuAI(api_key=API_KEY)
# 初始化数据库
init_db()

# 用户认证相关接口
@app.route('/api/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        email = data.get('email')
        
        if not all([username, password, email]):
            return jsonify({"error": "所有字段都是必填的"}), 400
            
        # 密码加密
        hashed_password = generate_password_hash(password, method='scrypt')
        
        db = get_db()
        cursor = db.cursor()
        
        try:
            cursor.execute(
                'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
                (username, hashed_password, email)
            )
            db.commit()
            return jsonify({"message": "注册成功"}), 200
        except sqlite3.IntegrityError:
            return jsonify({"error": "用户名或邮箱已存在"}), 409
        finally:
            db.close()
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        if not all([username, password]):
            return jsonify({"error": "用户名和密码都是必填的"}), 400
            
        db = get_db()
        cursor = db.cursor()
        
        user = cursor.execute(
            'SELECT * FROM users WHERE username = ?', 
            (username,)
        ).fetchone()
        
        if user and check_password_hash(user['password'], password):
            # 生成JWT token
            token = jwt.encode(
                {'user_id': user['id'], 'username': username},
                JWT_SECRET,
                algorithm='HS256'
            )
            return jsonify({
                "message": "登录成功",
                "token": token,
                "user_id": user['id']
            }), 200
        else:
            return jsonify({"error": "用户名或密码错误"}), 401
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()

# 项目管理相关接口
@app.route('/api/projects', methods=['GET', 'POST'])
def handle_projects():
    # 验证token
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return jsonify({"error": "未登录"}), 401
        
    try:
        # 确保 token 格式正确
        token_parts = auth_header.split()
        if len(token_parts) != 2 or token_parts[0].lower() != 'bearer':
            return jsonify({"error": "无效的token格式"}), 401
            
        token = token_parts[1]
        # 解析token
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        user_id = payload['user_id']
        
        db = get_db()
        cursor = db.cursor()
        
        if request.method == 'GET':
            # 获取用户的所有项目
            projects = cursor.execute(
                '''SELECT id, name, description, created_at, updated_at 
                   FROM projects WHERE user_id = ? 
                   ORDER BY updated_at DESC''',
                (user_id,)
            ).fetchall()
            
            return jsonify({
                "projects": [{
                    "id": p['id'],
                    "name": p['name'],
                    "description": p['description'],
                    "created_at": p['created_at'],
                    "updated_at": p['updated_at']
                } for p in projects]
            }), 200
            
        elif request.method == 'POST':
            # 创建新项目
            data = request.get_json()
            name = data.get('name')
            description = data.get('description', '')
            
            if not name:
                return jsonify({"error": "项目名称是必填的"}), 400
                
            cursor.execute(
                '''INSERT INTO projects (name, description, user_id) 
                   VALUES (?, ?, ?)''',
                (name, description, user_id)
            )
            db.commit()
            
            # 获取新创建的项目ID
            project_id = cursor.lastrowid
            
            return jsonify({
                "message": "项目创建成功",
                "project": {
                    "id": project_id,
                    "name": name,
                    "description": description
                }
            }), 201
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()

@app.route('/api/projects/<int:project_id>', methods=['GET', 'PUT', 'DELETE'])
def handle_project(project_id):
    # 验证token
    token = request.headers.get('Authorization')
    if not token:
        return jsonify({"error": "未登录"}), 401
        
    try:
        # 解析token
        payload = jwt.decode(token.split(' ')[1], JWT_SECRET, algorithms=['HS256'])
        user_id = payload['user_id']
        
        db = get_db()
        cursor = db.cursor()
        
        # 检查项目是否属于当前用户
        project = cursor.execute(
            'SELECT * FROM projects WHERE id = ? AND user_id = ?',
            (project_id, user_id)
        ).fetchone()
        
        if not project:
            return jsonify({"error": "项目不存在或无权访问"}), 404
            
        if request.method == 'GET':
            return jsonify({
                "id": project['id'],
                "name": project['name'],
                "description": project['description'],
                "created_at": project['created_at'],
                "updated_at": project['updated_at']
            }), 200
            
        elif request.method == 'PUT':
            # 更新项目信息
            data = request.get_json()
            name = data.get('name')
            description = data.get('description')
            
            if name:
                cursor.execute(
                    '''UPDATE projects 
                       SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP 
                       WHERE id = ?''',
                    (name, description, project_id)
                )
                db.commit()
                return jsonify({"message": "项目更新成功"}), 200
                
        elif request.method == 'DELETE':
            # 删除项目及其所有文档
            cursor.execute('DELETE FROM documents WHERE project_id = ?', (project_id,))
            cursor.execute('DELETE FROM projects WHERE id = ?', (project_id,))
            db.commit()
            return jsonify({"message": "项目删除成功"}), 200
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()

# 文档管理相关接口
@app.route('/api/projects/<int:project_id>/documents', methods=['GET', 'POST'])
def handle_documents(project_id):
    # 验证token
    token = request.headers.get('Authorization')
    if not token:
        return jsonify({"error": "未登录"}), 401
        
    try:
        # 解析token
        payload = jwt.decode(token.split(' ')[1], JWT_SECRET, algorithms=['HS256'])
        user_id = payload['user_id']
        
        db = get_db()
        cursor = db.cursor()
        
        # 检查项目是否属于当前用户
        project = cursor.execute(
            'SELECT * FROM projects WHERE id = ? AND user_id = ?',
            (project_id, user_id)
        ).fetchone()
        
        if not project:
            return jsonify({"error": "项目不存在或无权访问"}), 404
            
        if request.method == 'GET':
            # 获取项目下的所有文档
            documents = cursor.execute(
                '''SELECT id, name, description, created_at, updated_at 
                   FROM documents WHERE project_id = ? 
                   ORDER BY updated_at DESC''',
                (project_id,)
            ).fetchall()
            
            return jsonify({
                "documents": [{
                    "id": d['id'],
                    "name": d['name'],
                    "description": d['description'],
                    "created_at": d['created_at'],
                    "updated_at": d['updated_at']
                } for d in documents]
            }), 200
            
        elif request.method == 'POST':
            # 创建新文档
            data = request.get_json()
            name = data.get('name')
            description = data.get('description', '')
            
            if not name:
                return jsonify({"error": "文档名称是必填的"}), 400
                
            try:
                cursor.execute(
                    '''INSERT INTO documents 
                       (name, description, project_id, original_text, annotated_text, entity_data, relation_data) 
                       VALUES (?, ?, ?, ?, ?, ?, ?)''',
                    (name, description, project_id, '', '', '{}', '[]')
                )
                db.commit()  # 提交事务
                
                # 获取新创建的文档ID
                document_id = cursor.lastrowid
                
                return jsonify({
                    "message": "文档创建成功",
                    "document": {
                        "id": document_id,
                        "name": name,
                        "description": description,
                    }
                }), 201
                
            except sqlite3.Error as e:
                db.rollback()  # 发生错误时回滚事务
                return jsonify({"error": f"数据库错误: {str(e)}"}), 500
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()

@app.route('/api/documents/<int:document_id>', methods=['GET', 'PUT', 'DELETE'])
def handle_document(document_id):
    # 验证token
    token = request.headers.get('Authorization')
    if not token:
        return jsonify({"error": "未登录"}), 401
        
    try:
        # 解析token
        payload = jwt.decode(token.split(' ')[1], JWT_SECRET, algorithms=['HS256'])
        user_id = payload['user_id']
        
        db = get_db()
        cursor = db.cursor()
        
        # 添加用户权限验证
        document = cursor.execute('''
            SELECT d.* FROM documents d
            JOIN projects p ON d.project_id = p.id
            WHERE d.id = ? AND p.user_id = ?
        ''', (document_id, user_id)).fetchone()
        
        if not document:
            return jsonify({"error": "文档不存在或无权访问"}), 404
            
        if request.method == 'GET':
            # 获取文档信息和标注数据
            document = cursor.execute('''
                SELECT * FROM documents WHERE id = ?
            ''', (document_id,)).fetchone()
            
            if not document:
                return jsonify({"error": "文档不存在"}), 404
                
            return jsonify({
                "id": document['id'],
                "name": document['name'],
                "description": document['description'],
                "original_text": document['original_text'],
                "annotated_text": document['annotated_text'],
                "entity_data": json.loads(document['entity_data']) if document['entity_data'] else {},
                "relation_data": json.loads(document['relation_data']) if document['relation_data'] else [],
                "created_at": document['created_at'],
                "updated_at": document['updated_at']
            }), 200
            
        elif request.method == 'PUT':
            data = request.get_json()
            
            # 验证文档所有权
            document = cursor.execute('''
                SELECT d.* FROM documents d
                JOIN projects p ON d.project_id = p.id
                WHERE d.id = ? AND p.user_id = ?
            ''', (document_id, user_id)).fetchone()
            
            if not document:
                return jsonify({"error": "文档不存在或无权访问"}), 404
                
                
            try:
                # 开始事务
                cursor.execute('BEGIN')
                
                cursor.execute('''
                    UPDATE documents 
                    SET original_text = ?,
                        annotated_text = ?,
                        entity_data = ?,
                        relation_data = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (data.get('original_text'),
                      data.get('annotated_text'),
                      json.dumps(data.get('entity_data', {})),
                      json.dumps(data.get('relation_data', [])),
                      document_id))
                      
                db.commit()
                return jsonify({"message": "文档更新成功"}), 200
                
            except Exception as e:
                db.rollback()
                raise e
                
        elif request.method == 'DELETE':
            # 删除文档
            cursor.execute('DELETE FROM documents WHERE id = ?', (document_id,))
            db.commit()
            return jsonify({"message": "文档删除成功"}), 200
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db.close()

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
                    'length': len(entity)
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

    # 重新组织为原始格式，使用动态的类别
    result = {category: [] for category in entities_dict.keys()}
    
    # 按照在文本中的位置排序
    filtered_entities.sort(key=lambda x: x['start'])
    
    for entity in filtered_entities:
        if entity['category'] in result:  # 确保类别存在
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
        entity_types = data.get("entityTypes", ['人名', '地名', '时间', '职官', '书名'])  # 获取实体类型，如果没有则使用默认值
        
        # 确保所有的实体类型都是正确编码的字符串
        entity_types = [
            type if isinstance(type, str) else str(type) 
            for type in entity_types
        ]
        
        if not text:
            return jsonify({"error": "Text input is required"}), 400

        # 构建动态的JSON模板
        json_template = "{\n" + ",\n".join([f'    "{type}": []' for type in entity_types]) + "\n}"

        # 确保提示词中的实体类型列表是正确的中文格式
        entity_types_str = "、".join(entity_types)
        
        response = client.chat.completions.create(
            model="glm-4",
            messages=[
                {"role": "user", "content": f"提取以下文本中的命名实体：{text}"},
                {"role": "assistant", "content": "好的，请告诉我您需要的实体分类。"},
                {"role": "user", "content": f"""
                需要{entity_types_str}。
                请严格按照以下JSON格式输出，不要添加任何其他字符：
                {json_template}
                只输出JSON，不要任何解释说明。
                """}
            ]
        )

        # 记录返回的信息到本地文本文件
        with open('response_log.txt', 'a', encoding='utf-8') as log_file:
            log_file.write(response.choices[0].message.content + '\n')

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
        cleaned_entities = {entity_type: [] for entity_type in entity_types}
        
        for category in cleaned_entities.keys():
            if category in entities:
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
        
        # 确保返回数据格式正确
        if not isinstance(relations_data, dict) or 'relations' not in relations_data:
            return jsonify({"error": "Invalid response structure"}), 500
            
        return jsonify(relations_data)
        
    except json.JSONDecodeError as e:
        return jsonify({"error": f"JSON parsing error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500


@app.route('/analyze_person_locations', methods=['POST'])
def analyze_person_locations():
    try:
        data = request.get_json()
        text = data.get("text")
        entities = data.get("entities")
        
        if not text or not entities:
            return jsonify({"error": "文本和实体数据不能为空"}), 400
            
        # 修改提示词，要求输出更详细的地址
        prompt = f"""
        分析下面文本中每个人物的行动轨迹：
        
        文本：{text}
        
        已识别的实体：
        人名：{json.dumps(entities.get('人名', []), ensure_ascii=False)}
        地名：{json.dumps(entities.get('地名', []), ensure_ascii=False)}
        
        请仔细分析文本上下文，对于每个地名，尽可能推断出其完整的行政区划信息（省、市、县/区）。
        
        请严格按照以下JSON格式输出每个人物依次经过的地点：
        {{
            "person_routes": [
                {{
                    "person": "人名",
                    "locations": [
                        {{
                            "name": "原文地名",
                            "full_address": "完整地址（省市县/区）",
                            "level": "地名级别(省/市/县/区)"
                        }}
                    ]
                }}
            ]
        }}
        
        注意：
        1. 地名必须在已识别的地名实体中
        2. 将古代地名转为现代地名，如不能则丢弃
        2. 如果是省级地名，尽量推断具体城市
        3. 如果是市级地名，尽量推断具体区县
        4. 按时间顺序排列地点
        5. 只输出JSON格式，不要其他解释
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
            return jsonify({"error": "返回格式无效"}), 500
            
        json_content = result[start_index:end_index + 1]
        routes_data = json.loads(json_content)
        
        # 验证返回的地点是否都在已识别的地名实体中
        valid_locations = set(entities.get('地名', []))
        validated_routes = {"person_routes": []}
        
        for route in routes_data.get("person_routes", []):
            validated_locations = [
                loc for loc in route.get("locations", [])
                if loc["name"] in valid_locations
            ]
            if validated_locations:  # 只添加有有效地点的路线
                validated_routes["person_routes"].append({
                    "person": route["person"],
                    "locations": validated_locations
                })
        
        return jsonify(validated_routes)
        
    except json.JSONDecodeError as e:
        return jsonify({"error": f"JSON解析错误: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"未预期的错误: {str(e)}"}), 500

@app.route('/add_punctuation', methods=['POST'])
def add_punctuation():
    try:
        data = request.get_json()
        text = data.get("text")
        
        if not text:
            return jsonify({"error": "Text input is required"}), 400
            
        prompt = f"""
        请为以下文本添加标点符号和分段。要求：
        1. 保持原文的完整性，不要改变文字内容
        2. 只添加句号、逗号、顿号、问号和感叡号等基本标点
        3. 根据内容合理分段，每段开头空两个汉字宽度（使用全角空格）
        4. 直接返回处理好的文本，不要有任何解释说明
        5. 段落之间用换行符分隔
        
        文本：{text}
        """
        
        response = client.chat.completions.create(
            model="glm-4",
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        
        result = response.choices[0].message.content.strip()
        # 使用全角空格（相当于一个汉字宽度）
        paragraphs = result.split('\n')
        formatted_paragraphs = ['　　' + p.strip() for p in paragraphs if p.strip()]
        result = '\n'.join(formatted_paragraphs)
        
        return jsonify({"text": result}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# 启动服务
# 启动服务
if __name__ == '__main__':
    app.run(debug=True)
