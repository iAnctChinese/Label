let relations = [];

// 添加实体缓存
let entityCache = null;

// 添加全局变量用于保存各种状态
let originalText = ''; // 保存text-area中输入的原始文本(保留格式)
let annotatedText = ''; // 保存实体标注后的文本
let entityData = {     // 保存所有实体信息
    '人名': [],
    '地名': [],
    '时间': [],
    '职官': [],
    '书名': []
};
let relationData = []; // 保存所有关系信息 [{source: '', relation: '', target: ''}, ...]

// 添加全局变量来存储实体类型
let entityTypes = ['人名', '地名', '时间', '职官', '书名'];

// 基础功能
function updateWordCount() {
    const text = document.getElementById('text-area').value;
    // 获取当前文本并保留原始格式
    const currentText = text;
    
    // 去除空格和回车后进行比较
    const cleanCurrentText = currentText.replace(/[\s\n]/g, '');
    const cleanOriginalText = originalText.replace(/[\s\n]/g, '');
    
    // 如果文本发生改变，清除缓存并更新originalText
    if (cleanCurrentText !== cleanOriginalText) {
        clearCache();
        originalText = currentText; // 保存包含格式的原始文本
    }
    document.getElementById('word-count').innerText = `已输入 ${cleanCurrentText.length} 字`;
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
    // 如果有缓存，直接使用缓存
    if (entityCache) {
        renderNERResult(entityCache.entities);
        updateSidebarEntities();
        return;
    }

    // 检查originalText是否为空
    if (!originalText.trim()) {
        alert('请输入文本进行实体识别');
        // 恢复到结构标注按钮的高亮状态
        document.querySelectorAll('.nav-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector('.nav-button:first-child').classList.add('active');
        return;
    }

    document.getElementById('loading-spinner').style.display = 'block';
    toggleButtons(true);

    try {
        const response = await fetch('http://localhost:5000/ner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: originalText }), // 使用originalText
        });

        if (!response.ok) {
            throw new Error(`请求失败，状态码：${response.status}`);
        }

        const data = await response.json();
        // 更新缓存
        entityCache = {
            text: originalText,
            entities: data.entities
        };
        renderNERResult(data.entities);
        updateSidebarEntities();
    } catch (error) {
        console.error('识别出错:', error);
        alert('识别过程中出错，请稍后重试');
        
        // 恢复到结构标注按钮的高亮状态
        document.querySelectorAll('.nav-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector('.nav-button:first-child').classList.add('active');
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

    enableTextSelection(editableDiv);

    let text = originalText; // 使用保存的原始文本
    
    const tempDiv = document.createElement('div');
    tempDiv.style.whiteSpace = 'pre-wrap';
    tempDiv.textContent = text;
    
    // 更新entityData
    entityData = {
        '人名': nerResult['人名'] || [],
        '地名': nerResult['地名'] || [],
        '时间': nerResult['时间'] || [],
        '职官': nerResult['职官'] || [],
        '书名': nerResult['书名'] || []
    };
    
    // 按长度排序实体，优先替换较长的实体
    const allEntities = [];
    Object.entries(entityData).forEach(([category, entities]) => {
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
    
    // 替换实体时保持原始格式
    allEntities.forEach(({text: entity, category}) => {
        const highlightClass = getHighlightClass(category);
        const regex = new RegExp(entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        tempDiv.innerHTML = tempDiv.innerHTML.replace(regex, 
            `<span class="${highlightClass}" data-category="${category}">${entity}</span>`);
    });
    
    editableDiv.innerHTML = tempDiv.innerHTML;
    annotatedText = editableDiv.innerHTML; // 保存标注后的文本
    
    // 为所有span添加右键点击事件
    editableDiv.querySelectorAll('span[data-category]').forEach(span => {
        // 保持现有的右键点击事件
        span.addEventListener('contextmenu', function(event) {
            handleEntityClick(this);
            event.preventDefault();
        });

        // 如果之前有状态，恢复状态
        const existingSpan = document.querySelector(`span[data-category="${span.getAttribute('data-category')}"][data-status]`);
        if (existingSpan && existingSpan.textContent === span.textContent) {
            span.setAttribute('data-status', existingSpan.getAttribute('data-status'));
        }
    });

    document.querySelector('.container').innerHTML = '';
    document.querySelector('.container').appendChild(editableDiv);
}

let clickedEntity = null; // 添加全局变量来存储被点击的实体元素

function handleEntityClick(element) {
    event.preventDefault();
    
    if (event.button !== 2) {
        return;
    }
    
    clickedEntity = element;
    
    const currentMode = document.querySelector('.nav-button.active').textContent.trim();
    if (!currentMode.includes('实体标注')) {
        return;
    }

    const entityText = element.innerText;
    const currentCategory = element.getAttribute('data-category');

    const menu = document.createElement('div');
    menu.className = 'entity-menu';
    menu.style.top = `${event.clientY}px`;
    menu.style.left = `${event.clientX}px`;

    const menuButtons = `
        <button class="entity-menu-button">
            <img src="imges/问号.png" alt="未检查" class="menu-icon">
            设定实体状态为"未检查"
        </button>
        <button class="entity-menu-button">
            <img src="imges/对号.png" alt="已检查" class="menu-icon">
            设定实体状态为"已检查"
        </button>
        <button class="entity-menu-button">
            <img src="imges/返回.png" alt="取消" class="menu-icon">
            取消标注该实体
        </button>
        <button class="entity-menu-button">
            <img src="imges/返回.png" alt="取消全部" class="menu-icon">
            取消标注全部相同实体
        </button>
    `;

    menu.innerHTML = menuButtons;
    document.body.querySelectorAll('.entity-menu').forEach(el => el.remove());
    document.body.appendChild(menu);

    // 为按钮添加点击事件
    const buttons = menu.querySelectorAll('button');
    buttons[0].onclick = () => setEntityStatus(entityText, currentCategory, 'unchecked', menu);
    buttons[1].onclick = () => setEntityStatus(entityText, currentCategory, 'checked', menu);
    buttons[2].onclick = () => handleEntityDelete(entityText, currentCategory, buttons[2]);
    buttons[3].onclick = () => handleDeleteAllSameEntities(entityText, currentCategory, buttons[3]);

    document.body.addEventListener('click', () => menu.remove(), { once: true });
    event.stopPropagation();
}

// 添加新的处理函数：取消标注全部相同实体
function handleDeleteAllSameEntities(entityText, category, button) {
    // 移除菜单
    const menu = button.closest('.entity-menu');
    if (menu) {
        menu.remove();
    }

    // 从文本中删除所有相同的标注
    const editableDiv = document.getElementById('editable-result');
    const spans = editableDiv.querySelectorAll(`span[data-category="${category}"]`);
    spans.forEach(span => {
        if (span.textContent === entityText) {
            const textNode = document.createTextNode(span.textContent);
            span.parentNode.replaceChild(textNode, span);
        }
    });

    // 更新侧边栏的实体统计
    updateSidebarEntities();

    // 如果识图谱正在显示，则更新图谱
    const graphContainer = document.getElementById('knowledge-graph');
    if (graphContainer.style.display === 'block') {
        showKnowledgeGraph();
    }
}

// 修改处理函数，使用保存的实体元素
function handleEntityDelete(entityText, category, button) {
    // 移除菜单
    const menu = button.closest('.entity-menu');
    if (menu) {
        menu.remove();
    }

    // 使用保存的实体元素
    if (clickedEntity) {
        const textNode = document.createTextNode(clickedEntity.textContent);
        clickedEntity.parentNode.replaceChild(textNode, clickedEntity);
        clickedEntity = null; // 清除引用
    }

    // 更新侧边栏的实体统计
    updateSidebarEntities();

    // 如果知识图谱正在显示，则更新图谱
    const graphContainer = document.getElementById('knowledge-graph');
    if (graphContainer.style.display === 'block') {
        showKnowledgeGraph();
    }
}

// 关系标注相关函数
let relationCache = {
    text: null,
    entities: null,
    relations: []
};

async function extractRelations() {
    const editableDiv = document.getElementById('editable-result');
    if (!editableDiv) {
        alert('请先进行实体识别');
        document.querySelectorAll('.nav-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector('.nav-button:first-child').classList.add('active');
        return;
    }

    const currentText = editableDiv.innerText;
    const currentEntities = {...entityData}; // 使用保存的实体数据

    // 检查缓存是否有效
    if (relationCache.text === currentText && 
        JSON.stringify(relationCache.entities) === JSON.stringify(currentEntities)) {
        relations = relationCache.relations;
        relationData = [...relations]; // 更新relationData
        return;
    }

    try {
        const response = await fetch('http://localhost:5000/extract_relations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: currentText, entities: currentEntities })
        });

        if (!response.ok) {
            throw new Error('关系抽取失败');
        }

        const data = await response.json();
        relations = data.relations;
        relationData = [...relations]; // 更新relationData
        
        // 更新缓存
        relationCache = {
            text: currentText,
            entities: currentEntities,
            relations: relations
        };
    } catch (error) {
        console.error('关系抽取错误:', error);
        throw error;
    }
}

async function showRelationAnnotation() {
    const editableDiv = document.getElementById('editable-result');
    if (!editableDiv) {
        alert('请先进行实体识别');
        // 恢复到实体标注按钮的高亮状态
        document.querySelectorAll('.nav-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector('.nav-button:first-child').classList.add('active');
        return;
    }

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
                        <img src="imges/删除.png" 
                             alt="删除" 
                             class="delete-btn" 
                             onclick="deleteRelation(this)">
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('关系标注错误:', error);
        alert('关系标注失败，请稍后重试');
        
        // 恢复到实体标注按钮的高亮状态
        document.querySelectorAll('.nav-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector('.nav-button:nth-child(2)').classList.add('active');
    } finally {
        // 隐藏加载动画并恢复按钮
        document.getElementById('loading-spinner').style.display = 'none';
        toggleButtons(false);
    }
}

// 添加删除关系的函数
function deleteRelation(button) {
    const relationItem = button.closest('.relation-item');
    const index = Array.from(relationItem.parentElement.children).indexOf(relationItem) - 1;
    relations.splice(index, 1);
    relationData = [...relations]; // 更新relationData
    showRelationAnnotation();

    const graphContainer = document.getElementById('knowledge-graph');
    if (graphContainer.style.display === 'block') {
        showKnowledgeGraph();
    }
}

// 知识图谱相关函数
async function showKnowledgeGraph() {
    // 检查是否有文本内容
    const editableDiv = document.getElementById('editable-result');
    const textArea = document.getElementById('text-area');
    
    if ((!editableDiv || !editableDiv.textContent.trim()) && 
        (!textArea || !textArea.value.trim())) {
        alert('请先输入文本内容');
        
        // 恢复到结构标注页面
        returnToStructureAnnotation();
        
        // 恢复到结构标注按钮的高亮状态
        document.querySelectorAll('.nav-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector('.nav-button:first-child').classList.add('active');
        return;
    }

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

        // 更新侧边栏显示关系列表
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
                        <img src="imges/删除.png" 
                             alt="删除" 
                             class="delete-btn" 
                             onclick="deleteRelation(this)">
                    </div>
                `).join('')}
            </div>
        `;

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
        alert('知识图生成失败，请稍后重试');
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
        '书名': 'highlight-BOOK'
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
    const entities = {};
    const entityCounts = {};
    const entityTotalCounts = {};
    const typeEntityCounts = {}; // 存储每个类型的体总数

    // 初始化
    entityTypes.forEach(category => {
        entities[category] = new Set();
        entityCounts[category] = {};
        entityTotalCounts[category] = {};
        typeEntityCounts[category] = 0;
    });

    // 获取原始文本
    const originalText = document.getElementById('editable-result').innerText;

    // 统计实体
    document.querySelectorAll('[data-category]').forEach(element => {
        const category = element.getAttribute('data-category');
        const text = element.textContent;
        if (entityTypes.includes(category)) {
            entities[category].add(text);
            entityCounts[category][text] = (entityCounts[category][text] || 0) + 1;
            
            if (!entityTotalCounts[category][text]) {
                const regex = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                entityTotalCounts[category][text] = (originalText.match(regex) || []).length;
            }
        }
    });

    // 计算每个类型的实体总数
    entityTypes.forEach(category => {
        typeEntityCounts[category] = entities[category].size;
    });

    // 更新实体类型管理器
    const typesManagerHtml = `
        <div class="entity-types-manager">
            <div class="entity-types-header">
                实体类
                <button class="add-type-button" onclick="addEntityType()">
                    <img src="imges/添加.png" alt="添加" class="add-icon">
                    添加实体类
                </button>
            </div>
            <div class="entity-type-list">
                ${entityTypes.map(type => `
                    <div class="entity-type-tag ${getHighlightClass(type)}">
                        <span class="entity-type-name">${type}</span>
                        <span class="entity-type-count">${typeEntityCounts[type]}个实体</span>
                        <img src="imges/删除.png" 
                             alt="删除" 
                             class="delete-type-icon" 
                             onclick="deleteEntityType('${type}')">
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // 更新侧边栏内容
    document.getElementById('sidebar-content').innerHTML = typesManagerHtml + 
        entityTypes.map(category => `
            <div class="entity-group">
                <div class="entity-group-title">
                    ${category} (共${entities[category].size}个)
                </div>
                ${Array.from(entities[category]).map(entity => {
                    const annotatedCount = entityCounts[category][entity] || 0;
                    const totalCount = entityTotalCounts[category][entity] || 0;
                    const unAnnotatedCount = totalCount - annotatedCount;
                    const countText = `(已检${annotatedCount}处，未检${unAnnotatedCount}处)`;
                    
                    return `
                        <div class="entity-item">
                            <span class="${getHighlightClass(category)}">${entity}</span>
                            <span class="entity-count">${countText}</span>
                            <img src="imges/删除.png" 
                                 alt="删除" 
                                 class="delete-btn" 
                                 onclick="deleteEntityFromList(this, '${entity}', '${category}')">
                        </div>
                    `;
                }).join('')}
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
        originalText: originalText,
        annotatedText: annotatedText,
        entities: entityData,
        relations: relationData
    };

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

// 添加导航按钮点击处理函数
function handleNavButtonClick(button) {
    // 移除所有按钮的active类
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
    });
    // 为当前点击的按钮添加active类
    button.classList.add('active');
}

// 修改原有的导航按钮点击事件
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.nav-button').forEach(button => {
        button.addEventListener('click', function() {
            // 获取按钮文本，去除前后空格
            const currentMode = this.textContent.trim();
            const previousMode = document.querySelector('.nav-button.active').textContent.trim();
            
            // 处理按钮样式
            handleNavButtonClick(this);
            
            // 获取可编辑区域元素
            const editableDiv = document.getElementById('editable-result');
            
            if (currentMode.includes('实体标注')) {
                if (previousMode.includes('结构标注')) {
                    performNER();
                } else if (previousMode.includes('知识图谱')) {
                    returnToEntityAnnotation();
                } else if (previousMode.includes('关系标注')) {
                    updateSidebarEntities();
                }
                // 启用文本选择功能
                if (editableDiv) {
                    enableTextSelection(editableDiv);
                }
            } else {
                // 在其他模式下禁用文本选择功能
                if (editableDiv) {
                    disableTextSelection(editableDiv);
                }
                
                if (currentMode.includes('结构标注')) {
                    returnToStructureAnnotation();
                } else if (currentMode.includes('关系标注')) {
                    if (previousMode.includes('实体标注') || previousMode.includes('结构标注')) {
                        showRelationAnnotation();
                    } else if (previousMode.includes('知识图谱')) {
                        returnToRelationAnnotation();
                    }
                } else if (currentMode.includes('知识图谱')) {
                    showKnowledgeGraph();
                } else if (currentMode.includes('导出数据')) {
                    exportAllData();
                }
            }
        });
    });

    // 默认激活"结构标注"按钮
    const structureButton = document.querySelector('.nav-button');
    if (structureButton) {
        structureButton.classList.add('active');
    }
});

// 添加处理文本选择的函数
function handleTextSelection() {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    // 检查是否包含标点符号（至少包含逗号和句号）
    if (selectedText && !/[，。！？；：、]/.test(selectedText)) {
        // 获取选择的范围
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // 为选中的文本添加背景色
        const span = document.createElement('span');
        span.style.backgroundColor = '#e6f3ff'; // 浅蓝背景
        range.surroundContents(span);
        
        // 创建标注选项菜单
        showEntityMenu(rect.left, rect.bottom, selectedText, range);
        
        // 当菜单关闭时移除背景色
        document.addEventListener('mousedown', function removeHighlight(e) {
            const menu = document.querySelector('.entity-selection-menu');
            if (!menu || !menu.contains(e.target)) {
                // 如果没有进行实体标注，则恢复原始文本
                if (span.getAttribute('data-category') === null) {
                    const text = span.textContent;
                    span.parentNode.replaceChild(document.createTextNode(text), span);
                }
                document.removeEventListener('mousedown', removeHighlight);
            }
        });
    }
}

function showEntityMenu(x, y, selectedText, range) {
    // 移除已存在的菜单
    const existingMenu = document.querySelector('.entity-selection-menu');
    if (existingMenu) {
        existingMenu.remove();
    }

    // 创建菜单
    const menu = document.createElement('div');
    menu.className = 'entity-selection-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.zIndex = '1000';
    menu.style.background = 'white';
    menu.style.border = '1px solid #ccc';
    menu.style.borderRadius = '4px';
    menu.style.padding = '5px';
    menu.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';

    // 添加标注选项
    entityTypes.forEach(entity => {
        const button = document.createElement('button');
        button.className = 'entity-menu-item';
        
        // 创建颜色标记和文本的容器
        const content = document.createElement('div');
        content.className = 'entity-menu-content';
        
        // 创建颜色标记
        const colorMark = document.createElement('span');
        colorMark.className = `color-mark ${getHighlightClass(entity)}`;
        
        // 创建文本
        const text = document.createElement('span');
        text.textContent = entity;
        
        // 组装按钮内容
        content.appendChild(colorMark);
        content.appendChild(text);
        button.appendChild(content);
        
        button.onclick = () => {
            annotateSelection(range, entity);
            menu.remove();
        };
        
        menu.appendChild(button);
    });

    document.body.appendChild(menu);

    // 点击其他地方关闭菜单
    document.addEventListener('mousedown', function closeMenu(e) {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('mousedown', closeMenu);
        }
    });
}

function annotateSelection(range, category) {
    const span = document.createElement('span');
    span.className = getHighlightClass(category);
    span.setAttribute('data-category', category);
    
    // 将选中的内容移动到新的span中
    range.surroundContents(span);
    
    // 添加右键点击事件
    span.addEventListener('contextmenu', function(event) {
        handleEntityClick(this);
        event.preventDefault(); // 阻止默认的右键菜单
    });
    
    // 更新侧边栏
    updateSidebarEntities();
}

function deleteEntityFromList(button, entityText, category) {
    // 从侧边栏中删除实体项
    const entityItem = button.closest('.entity-item');
    entityItem.remove();

    // 从entityData中删除实体
    const index = entityData[category].indexOf(entityText);
    if (index > -1) {
        entityData[category].splice(index, 1);
    }

    // 从文本中删除对应的标注
    const editableDiv = document.getElementById('editable-result');
    const spans = editableDiv.querySelectorAll(`span[data-category="${category}"]`);
    spans.forEach(span => {
        if (span.textContent === entityText) {
            const textNode = document.createTextNode(span.textContent);
            span.parentNode.replaceChild(textNode, span);
        }
    });

    // 更新annotatedText
    annotatedText = editableDiv.innerHTML;

    // 更新侧边栏
    updateSidebarEntities();

    // 如果知识图谱正在显示，则更新图谱
    const graphContainer = document.getElementById('knowledge-graph');
    if (graphContainer.style.display === 'block') {
        showKnowledgeGraph();
    }
}

// 修改返回结构标注页面的函数
function returnToStructureAnnotation() {
    // 隐藏知识图谱（如果显示的话）
    const graphContainer = document.getElementById('knowledge-graph');
    if (graphContainer) {
        graphContainer.style.display = 'none';
    }
    
    // 显示容器
    const container = document.querySelector('.container');
    container.style.display = 'block';
    
    // 获取当前文本内容
    let currentText = '';
    const editableResult = document.getElementById('editable-result');
    
    if (editableResult) {
        // 保持原始格式
        currentText = editableResult.innerText;
        container.innerHTML = `
            <div class="icons">
                <img src="imges/搜索.png" alt="查询" title="查询" onclick="alert('执行查询功能')">
                <img src="imges/复制文件.png" alt="复制" title="复制" onclick="copyText()">
                <img src="imges/剪切.png" alt="剪切" title="剪切" onclick="cutText()">
                <img src="imges/paste.png" alt="粘贴" title="粘贴" onclick="pasteText()">
            </div>
            <div class="separator"></div>
            <textarea class="text-area" id="text-area" oninput="updateWordCount()" style="white-space: pre-wrap;">${currentText}</textarea>
            <div class="word-count" id="word-count"></div>
        `;
    }
    
    // 更新字数统计
    updateWordCount();
    
    // 清空侧边栏
    const sidebarContent = document.getElementById('sidebar-content');
    if (sidebarContent) {
        sidebarContent.innerHTML = '';
    }
}

// 添加新的函数来管理文本选择事件监听
function enableTextSelection(element) {
    // 存储事件监听器的引用，以便后续可以移除
    element.textSelectionHandler = function(event) {
        handleTextSelection.call(this, event);
    };
    element.addEventListener('mouseup', element.textSelectionHandler);
}

// 添加禁用文本选择的函数
function disableTextSelection(element) {
    if (element && element.textSelectionHandler) {
        element.removeEventListener('mouseup', element.textSelectionHandler);
        element.textSelectionHandler = null;
    }
}

// 添加清除缓存的函数
function clearCache() {
    entityCache = null;
    relationCache = {
        text: null,
        entities: null,
        relations: []
    };
    relations = [];
}

// 添加新的实体类型
function addEntityType() {
    const newType = prompt('请输入新的实体类型名称：');
    if (newType && !entityTypes.includes(newType)) {
        entityTypes.push(newType);
        entityData[newType] = [];
        updateSidebarEntities();
    } else if (entityTypes.includes(newType)) {
        alert('该实体类型已存在！');
    }
}

// 删除实体类
function deleteEntityType(type) {
    if (confirm(`确定要删除实体类型"${type}"吗？这将同时删除该类型的所有标注。`)) {
        // 从文本中删除该类型的所有标注
        const editableDiv = document.getElementById('editable-result');
        const spans = editableDiv.querySelectorAll(`span[data-category="${type}"]`);
        spans.forEach(span => {
            const textNode = document.createTextNode(span.textContent);
            span.parentNode.replaceChild(textNode, span);
        });

        // 从entityTypes和entityData中删除该类型
        const index = entityTypes.indexOf(type);
        if (index > -1) {
            entityTypes.splice(index, 1);
            delete entityData[type];
        }

        // 更新侧边栏
        updateSidebarEntities();
    }
}

function setEntityStatus(entityText, category, status, menu) {
    // 移除菜单
    if (menu) {
        menu.remove();
    }

    // 使用保存的实体元素
    if (clickedEntity) {
        if (status === 'unchecked') {
            clickedEntity.setAttribute('data-status', 'unchecked');
        } else {
            clickedEntity.removeAttribute('data-status');
        }
        clickedEntity = null; // 清除引用
    }

    // 更新所有相同文本的实体状态
    const editableDiv = document.getElementById('editable-result');
    const spans = editableDiv.querySelectorAll(`span[data-category="${category}"]`);
    spans.forEach(span => {
        if (span.textContent === entityText) {
            if (status === 'unchecked') {
                span.setAttribute('data-status', 'unchecked');
            } else {
                span.removeAttribute('data-status');
            }
        }
    });
}
