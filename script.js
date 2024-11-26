let relations = [];

// 基础功能
function updateWordCount() {
    const text = document.getElementById('text-area').value;
    const wordCount = text.length;
    document.getElementById('word-count').innerText = `已输入 ${wordCount} 字`;
}

function copyText() {
    const textArea = document.getElementById('text-area');
    textArea.select();
    document.execCommand('copy');
    alert('文本已复制');
}

function cutText() {
    const textArea = document.getElementById('text-area');
    textArea.select();
    document.execCommand('cut');
    alert('文本已剪切');
}

function pasteText() {
    navigator.clipboard.readText().then(text => {
        const textArea = document.getElementById('text-area');
        textArea.value += text;
        updateWordCount();
    }).catch(err => {
        alert('粘贴失败，请允许访问剪贴板');
    });
}

// 实体标注相关函数
async function performNER() {
    const text = document.getElementById('text-area').value;
    if (!text.trim()) {
        alert('请输入文本进行实体识别');
        return;
    }

    document.getElementById('loading-spinner').style.display = 'block';
    toggleButtons(true);

    try {
        const response = await fetch('http://localhost:5000/ner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            throw new Error(`请求失败，状态码：${response.status}`);
        }

        const data = await response.json();
        const nerResult = data.entities;
        renderNERResult(nerResult);
        updateSidebarEntities();
    } catch (error) {
        console.error('识别出错:', error);
        alert('识别过程中出错，请稍后重试');
    } finally {
        document.getElementById('loading-spinner').style.display = 'none';
        toggleButtons(false);
    }
}

function renderNERResult(nerResult) {
    const editableDiv = document.createElement('div');
    editableDiv.id = 'editable-result';
    editableDiv.contentEditable = 'true';
    editableDiv.className = 'annotated-text';

    let text = document.getElementById('text-area').value;
    const categories = ['人名', '地名', '时间', '职官', '书名'];
    
    // 按长度排序实体，优先替换较长的实体
    const allEntities = [];
    categories.forEach(category => {
        const entities = nerResult[category] || [];
        entities.forEach(entity => {
            allEntities.push({
                text: entity,
                category: category,
                length: entity.length
            });
        });
    });
    
    // 按长度降序排序
    allEntities.sort((a, b) => b.length - a.length);
    
    // 创建一个临时的div来存储HTML
    const tempDiv = document.createElement('div');
    tempDiv.textContent = text;
    
    // 替换实体
    allEntities.forEach(({text: entity, category}) => {
        const highlightClass = getHighlightClass(category);
        const regex = new RegExp(entity, 'g');
        tempDiv.innerHTML = tempDiv.innerHTML.replace(regex, 
            `<span class="${highlightClass}" data-category="${category}">${entity}</span>`);
    });
    
    editableDiv.innerHTML = tempDiv.innerHTML;
    
    // 为所有span添加点击事件
    editableDiv.querySelectorAll('span[data-category]').forEach(span => {
        span.addEventListener('click', function(event) {
            handleEntityClick(this);
            event.stopPropagation();
        });
    });

    document.querySelector('.container').innerHTML = '';
    document.querySelector('.container').appendChild(editableDiv);
}

function handleEntityClick(element) {
    const entityText = element.innerText;
    const currentCategory = element.getAttribute('data-category');

    const menu = document.createElement('div');
    menu.style.position = 'absolute';
    menu.style.top = `${event.clientY}px`;
    menu.style.left = `${event.clientX}px`;
    menu.style.backgroundColor = '#fff';
    menu.style.border = '1px solid #ccc';
    menu.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
    menu.style.padding = '5px';
    menu.style.borderRadius = '5px';
    menu.style.zIndex = '1000';

    menu.innerHTML = `
        <button onclick="editEntity('${entityText}', '${currentCategory}', this)">编辑</button>
        <button onclick="deleteEntity(this)">删除</button>
        <button onclick="reclassifyEntity('${entityText}', this)">重新分类</button>
    `;

    document.body.querySelectorAll('.entity-menu').forEach(el => el.remove());
    menu.classList.add('entity-menu');
    document.body.appendChild(menu);

    document.body.addEventListener('click', () => menu.remove(), { once: true });
    event.stopPropagation();
}

// 关系标注相关函数
async function extractRelations() {
    const editableDiv = document.getElementById('editable-result');
    if (!editableDiv) {
        alert('请先进行实体识别');
        return;
    }

    const text = editableDiv.innerText;
    const entities = {};
    ['人名', '地名', '时间', '职官', '书名'].forEach(category => {
        entities[category] = Array.from(
            editableDiv.querySelectorAll(`[data-category="${category}"]`)
        ).map(el => el.textContent);
    });

    try {
        const response = await fetch('http://localhost:5000/extract_relations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, entities })
        });

        if (!response.ok) {
            throw new Error('关系抽取失败');
        }

        const data = await response.json();
        relations = data.relations;

    } catch (error) {
        console.error('关系抽取错误:', error);
        throw error; // 向上传递错误，让调用函数处理
    }
}

async function showRelationAnnotation() {
    // 显示加载动画
    document.getElementById('loading-spinner').style.display = 'block';
    toggleButtons(true);

    try {
        // 调用关系抽取
        await extractRelations();

        // 显示结果
        document.getElementById('sidebar-content').innerHTML = `
            <div class="relation-list">
                <div class="entity-group-title">关系实例</div>
                ${relations.map(rel => `
                    <div class="relation-item">
                        <span>${rel.source}</span>
                        <span style="margin: 0 8px">→</span>
                        <span>${rel.relation}</span>
                        <span style="margin: 0 8px">→</span>
                        <span>${rel.target}</span>
                        <button class="delete-btn" onclick="deleteRelation(this)">删除</button>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('关系标注错误:', error);
        alert('关系标注失败，请稍后重试');
    } finally {
        // 隐藏加载动画并恢复按钮
        document.getElementById('loading-spinner').style.display = 'none';
        toggleButtons(false);
    }
}

// 添加删除关系的函数
function deleteRelation(button) {
    const relationItem = button.closest('.relation-item');
    const index = Array.from(relationItem.parentElement.children).indexOf(relationItem) - 1; // -1 因为标题也算一个子元素
    relations.splice(index, 1);
    showRelationAnnotation();

    // 如果知识图谱正在显示，则更新图谱
    const graphContainer = document.getElementById('knowledge-graph');
    if (graphContainer.style.display === 'block') {
        showKnowledgeGraph();
    }
}

// 知识图谱相���函数
async function showKnowledgeGraph() {
    // 显示加载动画
    document.getElementById('loading-spinner').style.display = 'block';
    toggleButtons(true);
    
    try {
        // 隐藏文本编辑区域
        const container = document.querySelector('.container');
        container.style.display = 'none';
        
        // 显示知识图谱
        const graphContainer = document.getElementById('knowledge-graph');
        graphContainer.style.display = 'block';

        // 如果没有关系数据，先进行关系抽取
        if (relations.length === 0) {
            await extractRelations();
        }

        const nodes = new Set();
        relations.forEach(rel => {
            nodes.add(rel.source);
            nodes.add(rel.target);
        });

        const nodesData = Array.from(nodes).map((node, id) => ({
            id,
            label: node,
            size: 30,  // 增大节点大小
            font: {
                size: 16,  // 增大字体
                color: 'black'  // 白色文字
            },
            borderWidth: 2,
            shadow: true  // 添加阴影
        }));

        const nodeMap = {};
        nodesData.forEach(node => {
            nodeMap[node.label] = node.id;
        });

        const edgesData = relations.map((rel, id) => ({
            id,
            from: nodeMap[rel.source],
            to: nodeMap[rel.target],
            label: rel.relation,
            arrows: {
                to: {
                    enabled: true,
                    scaleFactor: 1.5  // 增大箭头
                }
            },
            width: 2,  // 增加边的宽度
            shadow: true  // 添加阴影
        }));

        const data = {
            nodes: new vis.DataSet(nodesData),
            edges: new vis.DataSet(edgesData)
        };

        const options = {
            nodes: {
                shape: 'dot',
                size: 30,
                font: {
                    size: 16,
                    color: '#ffffff'
                },
                borderWidth: 2,
                shadow: true,
                scaling: {
                    min: 20,
                    max: 40
                },
                color: {
                    background: '#41466E',
                    border: '#41466E',
                    highlight: {
                        background: '#5C6091',
                        border: '#41466E'
                    },
                    hover: {
                        background: '#5C6091',
                        border: '#41466E'
                    }
                }
            },
            edges: {
                font: {
                    size: 14,
                    align: 'middle',
                    background: 'white'
                },
                color: {
                    color: '#41466E',
                    highlight: '#5C6091',
                    hover: '#5C6091'
                },
                smooth: {
                    type: 'curvedCW',
                    roundness: 0.2
                },
                length: 300  // 增加边的长度，使节点之间距离更远
            },
            physics: {
                enabled: true,
                barnesHut: {
                    gravitationalConstant: -3000,  // 减小引力常数
                    centralGravity: 0.1,          // 减小中心引力
                    springLength: 300,            // 增加弹簧长度
                    springConstant: 0.02,         // 减小弹簧常数
                    damping: 0.09,
                    avoidOverlap: 1              // 添加节点重叠避免
                },
                stabilization: {
                    enabled: true,
                    iterations: 1000,
                    updateInterval: 100,
                    fit: true
                }
            },
            layout: {
                improvedLayout: true,
                randomSeed: 42      // 添加随机种子以获得一致的布局
            }
        };

        // 创建网络图实例
        const network = new vis.Network(graphContainer, data, options);

        // 添加双击事件监听
        network.on('doubleClick', function(params) {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const node = data.nodes.get(nodeId);
                alert(`实体: ${node.label}`);
            } else if (params.edges.length > 0) {
                const edgeId = params.edges[0];
                const edge = data.edges.get(edgeId);
                const sourceNode = data.nodes.get(edge.from);
                const targetNode = data.nodes.get(edge.to);
                alert(`关系: ${sourceNode.label} -> ${edge.label} -> ${targetNode.label}`);
            }
        });

        // 添加缩放按钮
        const zoomControls = document.createElement('div');
        zoomControls.className = 'zoom-controls';
        zoomControls.innerHTML = `
            <button onclick="zoomIn()">+</button>
            <button onclick="zoomOut()">-</button>
            <button onclick="resetZoom()">重置</button>
        `;
        graphContainer.appendChild(zoomControls);

        // 保存network实例到全局变量
        window.graphNetwork = network;
        
    } catch (error) {
        console.error('知识图谱生成错误:', error);
        alert('知识图谱生成失败，请稍后重试');
        const graphContainer = document.getElementById('knowledge-graph');
        graphContainer.style.display = 'none';
        // 显示回文本编辑区域
        const container = document.querySelector('.container');
        container.style.display = 'block';
    } finally {
        document.getElementById('loading-spinner').style.display = 'none';
        toggleButtons(false);
    }
}

// 添加缩放控制函数
function zoomIn() {
    if (window.graphNetwork) {
        const scale = window.graphNetwork.getScale();
        window.graphNetwork.moveTo({
            scale: scale * 1.2
        });
    }
}

function zoomOut() {
    if (window.graphNetwork) {
        const scale = window.graphNetwork.getScale();
        window.graphNetwork.moveTo({
            scale: scale * 0.8
        });
    }
}

function resetZoom() {
    if (window.graphNetwork) {
        window.graphNetwork.fit({
            animation: true
        });
    }
}

// 辅助函数
function getHighlightClass(category) {
    const highlightClasses = {
        '人名': 'highlight-PER',
        '地名': 'highlight-LOC',
        '时间': 'highlight-MISC',
        '职官': 'highlight-ORG',
        '书名': 'highlight-MISC'
    };
    return highlightClasses[category] || 'highlight-MISC';
}

function toggleButtons(disable) {
    const buttons = document.querySelectorAll('button, .nav-button, .icons img');
    buttons.forEach(button => {
        button.disabled = disable;
        button.style.pointerEvents = disable ? 'none' : 'auto';
        button.style.opacity = disable ? '0.6' : '1';
    });
}

function updateSidebarEntities() {
    const categories = ['人名', '地名', '时间', '职官', '书名'];
    const entities = {};

    categories.forEach(category => {
        entities[category] = new Set();
    });

    document.querySelectorAll('[data-category]').forEach(element => {
        const category = element.getAttribute('data-category');
        const text = element.textContent;
        if (categories.includes(category)) {
            entities[category].add(text);
        }
    });

    document.getElementById('sidebar-content').innerHTML = categories.map(category => `
        <div class="entity-group">
            <div class="entity-group-title">${category}</div>
            ${Array.from(entities[category]).map(entity => `
                <div class="entity-item">
                    <span class="${getHighlightClass(category)}">${entity}</span>
                    <button class="delete-btn" onclick="deleteEntityFromList(this, '${entity}', '${category}')">删除</button>
                </div>
            `).join('')}
        </div>
    `).join('');
}

function exportAllData() {
    const editableDiv = document.getElementById('editable-result');
    if (!editableDiv) {
        alert('没有可导出的数据');
        return;
    }

    const exportData = {
        text: editableDiv.innerText,
        entities: {},
        relations: relations
    };

    ['人名', '地名', '时间', '职官', '书名'].forEach(category => {
        exportData.entities[category] = Array.from(
            editableDiv.querySelectorAll(`[data-category="${category}"]`)
        ).map(el => el.textContent);
    });

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'annotation_data.json';
    a.click();
    URL.revokeObjectURL(url);
}

// 添加返回实体标注页面的函数
function returnToEntityAnnotation() {
    // 隐藏知识图谱
    const graphContainer = document.getElementById('knowledge-graph');
    graphContainer.style.display = 'none';
    
    // 显示文本编辑区域
    const container = document.querySelector('.container');
    container.style.display = 'block';
    
    // 更新侧边栏显示实体列表
    updateSidebarEntities();
}

// 添加返回关系标注页面的函数
function returnToRelationAnnotation() {
    // 隐藏知识图谱
    const graphContainer = document.getElementById('knowledge-graph');
    graphContainer.style.display = 'none';
    
    // 显示文本编辑区域
    const container = document.querySelector('.container');
    container.style.display = 'block';
    
    // 显示关系列表
    showRelationAnnotation();
}

// 修改原有的导航按钮点击事件
document.addEventListener('DOMContentLoaded', function() {
    // 实体标注按钮
    const entityButton = document.querySelector('.nav-button[onclick="performNER()"]');
    entityButton.onclick = function() {
        if (document.getElementById('knowledge-graph').style.display === 'block') {
            returnToEntityAnnotation();
        } else {
            performNER();
        }
    };

    // 关系标注按钮
    const relationButton = document.querySelector('.nav-button[onclick="showRelationAnnotation()"]');
    relationButton.onclick = function() {
        if (document.getElementById('knowledge-graph').style.display === 'block') {
            returnToRelationAnnotation();
        } else {
            showRelationAnnotation();
        }
    };
}); 