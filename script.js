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
    // 如果没有原始文本，从当前显示的元素获取
    if (!originalText) {
        const textArea = document.getElementById('text-area');
        const editableDiv = document.getElementById('editable-result');
        
        if (textArea && textArea.style.display !== 'none') {
            originalText = textArea.value.trim();
        } else if (editableDiv) {
            originalText = editableDiv.innerText.trim();
        }
    }

    if (!originalText) {
        alert('请输入文本进行实体识别');
        return;
    }

    // 如果有缓存，直接使用缓存
    if (entityCache) {
        // 检查缓存的文本是否与当前文本一致
        const cleanCurrentText = originalText.replace(/[\s\n]/g, '');
        const cleanCachedText = entityCache.text.replace(/[\s\n]/g, '');
        
        if (cleanCurrentText === cleanCachedText) {
            // 确保缓存的实体类型与当前的实体类型匹配
            entityTypes.forEach(type => {
                if (!entityCache.entities[type]) {
                    entityCache.entities[type] = [];
                }
            });
            
            renderNERResult(entityCache.entities);
            updateSidebarEntities();
            return;
        }
    }

    document.getElementById('loading-spinner').style.display = 'block';
    toggleButtons(true);

    try {
        const response = await fetch('http://localhost:5000/ner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: originalText,
                entityTypes: entityTypes  // 添加实体类型数组
            }),
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
    // 保存当前工具栏
    const toolbar = document.querySelector('.icons');
    
    const editableDiv = document.createElement('div');
    editableDiv.id = 'editable-result';
    editableDiv.contentEditable = 'true';
    editableDiv.className = 'annotated-text';

    // 启用文本选择功能
    enableTextSelection(editableDiv);

    let text = originalText; // 使用保存的原始文本
    
    const tempDiv = document.createElement('div');
    tempDiv.style.whiteSpace = 'pre-wrap';
    tempDiv.textContent = text;
    
    // 更新entityData
    Object.keys(entityData).forEach(key => {
        entityData[key] = nerResult[key] || [];
    });
    
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

    // 替换容器内容，但保留工具栏
    const container = document.querySelector('.container');
    container.innerHTML = '';
    
    // 重新添加工具栏
    container.appendChild(toolbar);
    
    // 添加分隔线
    const separator = document.createElement('div');
    separator.className = 'separator';
    container.appendChild(separator);
    
    // 添加编辑区域
    container.appendChild(editableDiv);
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

    // 更新边栏的实体统计
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
        
        // 显示知识图
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
                length: 300  // 增加边的长度，使节点之间距���更远
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
        //alert('知识图生成失败，请稍后重试');
        const graphContainer = document.getElementById('knowledge-graph');
        graphContainer.style.display = 'none';
        // 显示回文本编辑区域
        const container = document.querySelector('.container');
        container.style.display = 'block';
        
        // 恢复到关系标注按钮的高亮状态
        document.querySelectorAll('.nav-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector('.nav-button:nth-child(3)').classList.add('active');
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
        '书名': 'highlight-BOOK',
    };
    return highlightClasses[category] || 'highlight-NEWADD';
}

function toggleButtons(disable) {
    const buttons = document.querySelectorAll('button, .icons img');
    buttons.forEach(button => {
        button.disabled = disable;
        button.style.pointerEvents = disable ? 'none' : 'auto';
        button.style.opacity = disable ? '0.6' : '1';
    });
    
    // 导航按钮始终保持可用
    document.querySelectorAll('.nav-button').forEach(button => {
        button.style.pointerEvents = 'auto';
        button.style.opacity = '1';
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

// 修改导航按钮点击事件处理
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.nav-button').forEach(button => {
        button.addEventListener('click', function() {
            const currentMode = this.textContent.trim();
            
            // 处理按钮样式
            handleNavButtonClick(this);
            
            // 获取可编辑区元素
            const editableDiv = document.getElementById('editable-result');
            const textArea = document.getElementById('text-area');
            const autoRecognizeBtn = document.getElementById('auto-recognize-btn');
            
            // 根据不同模式显示/隐藏自动识别按钮
            if (currentMode.includes('实体标注') || currentMode.includes('关系标注')) {
                autoRecognizeBtn.style.display = 'inline';
                
                // 如果是从结构标注切换过来，需要保存文本内容
                if (textArea && textArea.style.display !== 'none') {
                    originalText = textArea.value.trim();
                } else if (editableDiv) {
                    // 保存带有标注的文本
                    annotatedText = editableDiv.innerHTML;
                }
            } else {
                autoRecognizeBtn.style.display = 'none';
            }

            if (currentMode.includes('实体标注')) {
                // 切换到实体标注模式
                if (editableDiv) {
                    enableTextSelection(editableDiv);
                    // 更新侧边栏显示实体列表
                    updateSidebarEntities();
                } else {
                    // 如果没有可编辑区域，创建一个
                    returnToStructureAnnotation();
                    const newEditableDiv = document.getElementById('editable-result');
                    if (newEditableDiv) {
                        enableTextSelection(newEditableDiv);
                        // 更新侧边栏显示实体列表
                        updateSidebarEntities();
                    }
                }
            } else {
                // 在其他模式下禁用文本选择功能
                if (editableDiv) {
                    disableTextSelection(editableDiv);
                }
                
                if (currentMode.includes('结构标注')) {
                    returnToStructureAnnotation();
                } else if (currentMode.includes('关系标注')) {
                    if (editableDiv) {
                        // 切换到关系标注模式
                        showRelationAnnotationUI();
                    } else {
                        // 如果没有可编辑区域，创建一个
                        returnToStructureAnnotation();
                        showRelationAnnotationUI();
                    }
                } else if (currentMode.includes('知识图谱')) {
                    showKnowledgeGraph();
                } else if (currentMode.includes('地图轨迹')) {
                    showLocationTrajectory();
                } else if (currentMode.includes('导出数据')) {
                    exportAllData();
                }
            }
        });
    });
});

// 修改自动识别功能
async function autoRecognize() {
    const textArea = document.getElementById('text-area');
    const editableDiv = document.getElementById('editable-result');
    let text = '';
    
    // 根据当前显示的元素获取文本内容
    if (textArea && textArea.style.display !== 'none') {
        text = textArea.value.trim();
    } else if (editableDiv) {
        text = editableDiv.innerText.trim();
    }
    
    if (!text) {
        alert('请输入文本进行识别');
        return;
    }
    
    const currentMode = document.querySelector('.nav-button.active').textContent.trim();
    
    // 显示加载动画
    document.getElementById('loading-spinner').style.display = 'block';
    toggleButtons(true);
    
    try {
        // 保存原始文本，用于后续处理
        originalText = text;
        
        if (currentMode.includes('实体标注')) {
            await performNER();
        } else if (currentMode.includes('关系标注')) {
            await showRelationAnnotation();
        }
    } catch (error) {
        console.error('识别错误:', error);
        alert('识别失败，请稍后重试');
    } finally {
        // 隐藏加载动画并恢复按钮
        document.getElementById('loading-spinner').style.display = 'none';
        toggleButtons(false);
    }
}

// 修改返回结构标注页面的函数，保留标注后的文本
function returnToStructureAnnotation() {
    // 隐藏知识图谱和地图
    const graphContainer = document.getElementById('knowledge-graph');
    if (graphContainer) {
        graphContainer.style.display = 'none';
    }
    
    const mapContainer = document.getElementById('map-container');
    if (mapContainer) {
        mapContainer.style.display = 'none';
        if (baiduMap) {
            baiduMap.clearOverlays();
        }
    }
    
    // 显示容器
    const container = document.querySelector('.container');
    container.style.display = 'block';
    
    // 获取当前文本内容，优先使用标注后的文本
    let currentText = annotatedText || originalText;
    
    // 如果都没有，尝试从当前显示的元素获取
    if (!currentText) {
        const editableResult = document.getElementById('editable-result');
        const textArea = document.getElementById('text-area');
        
        if (editableResult) {
            currentText = editableResult.innerHTML; // 使用innerHTML保留标注
        } else if (textArea) {
            currentText = textArea.value;
        }
    }
    
    // 更新文本框内容，保持原始格式
    container.innerHTML = `
        <div class="icons">
            <img src="imges/搜索.png" alt="查询" title="查询" onclick="alert('执行查询功能')">
            <img src="imges/复制文件.png" alt="复制" title="复制" onclick="copyText()">
            <img src="imges/剪切.png" alt="剪切" title="剪切" onclick="cutText()">
            <img src="imges/paste.png" alt="粘贴" title="粘贴" onclick="pasteText()">
            <img src="imges/自动识别.png" alt="自动识别" title="自动识别" onclick="autoRecognize()" id="auto-recognize-btn" style="display: none;">
        </div>
        <div class="separator"></div>
        <div class="annotated-text" id="editable-result" contenteditable="true">${currentText}</div>
        <div class="word-count" id="word-count"></div>
    `;
    
    // 更新字数统计
    const cleanText = currentText.replace(/<[^>]*>/g, '').replace(/[\s\n]/g, '');
    document.getElementById('word-count').innerText = `已输入 ${cleanText.length} 字`;
    
    // 清空侧边栏
    const sidebarContent = document.getElementById('sidebar-content');
    if (sidebarContent) {
        sidebarContent.innerHTML = '';
    }
}

// 添加只显示关系标注UI的函数，不执行识别
function showRelationAnnotationUI() {
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
}

// 添加处理文本选择的函数
function handleTextSelection() {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    // 检查是否包含标点符号（至少包逗号和句号）
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
    // 从侧边栏中删除实体
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

// 修改地图相关的全局变量
let baiduMap = null;
let mapMarkers = [];
let polyline = null;
let personRoutes = [];

async function showLocationTrajectory() {
    const editableDiv = document.getElementById('editable-result');
    if (!editableDiv) {
        alert('请先进行实体识别');
        return;
    }

    try {
        // 显示加载动画
        document.getElementById('loading-spinner').style.display = 'block';
        toggleButtons(true);

        // 获取人物轨迹数据
        const response = await fetch('http://localhost:5000/analyze_person_locations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: editableDiv.innerText,
                entities: entityData
            })
        });

        if (!response.ok) {
            throw new Error('获取人物轨迹失败');
        }

        const data = await response.json();
        personRoutes = data.person_routes;

        // 隐藏其他容器
        const container = document.querySelector('.container');
        container.style.display = 'none';
        const graphContainer = document.getElementById('knowledge-graph');
        graphContainer.style.display = 'none';

        // 显示地图容器
        const mapContainer = document.getElementById('map-container');
        mapContainer.style.display = 'block';

        // 确保地图容器可见后再初始化地图
        setTimeout(() => {
            if (!baiduMap) {
                baiduMap = new BMap.Map('map-container');
                const point = new BMap.Point(116.404, 39.915);
                baiduMap.centerAndZoom(point, 5);
                baiduMap.enableScrollWheelZoom();
                baiduMap.addControl(new BMap.NavigationControl());
                baiduMap.addControl(new BMap.ScaleControl());
                baiduMap.addControl(new BMap.OverviewMapControl());
                baiduMap.addControl(new BMap.MapTypeControl());
            } else {
                baiduMap.clearOverlays();
            }

            // 更新侧边栏显示人物列表
            updateSidebarPersons(personRoutes);
        }, 100);

    } catch (error) {
        console.error('地图轨迹生成错误:', error);
        alert('地图轨迹生成失败，请稍后重试');
    } finally {
        document.getElementById('loading-spinner').style.display = 'none';
        toggleButtons(false);
    }
}

function updateSidebarPersons(routes) {
    const sidebarContent = document.getElementById('sidebar-content');
    sidebarContent.innerHTML = `
        <div class="person-list">
            <div class="entity-group-title">人物轨迹</div>
            ${routes.map((route, index) => `
                <div class="person-item" onclick="showPersonRoute('${route.person}')">
                    <span class="person-index">${index + 1}</span>
                    <span class="person-name">${route.person}</span>
                    <span class="location-count">(${route.locations.length}个地点)</span>
                </div>
            `).join('')}
        </div>
    `;
}

function showPersonRoute(person) {
    if (!baiduMap) {
        console.error('图未初始化');
        return;
    }

    // 清除现有标记和路线
    clearMapOverlays();

    // 获取该人物的轨迹
    const route = personRoutes.find(r => r.person === person);
    if (!route) return;

    // 使用百度地图地理编码服务
    const geocoder = new BMap.Geocoder();
    const points = [];

    // 处理每个地点
    route.locations.forEach((location, index) => {
        // 处理���址格式
        let searchAddress = location.full_address;
        
        // 如果是省地址，确保使用省会城市
        if (location.level === "省") {
            const provinceMap = {
                '浙江': '杭州市',
                '江苏': '南京市',
                '安徽': '合肥市',
                '福建': '福州市',
                '山东': '济南市',
                '河南': '郑州市',
                '湖北': '武汉市',
                '湖南': '长沙市',
                '广东': '广州市',
                '海南': '海口市',
                '四川': '成都市',
                '贵州': '贵阳市',
                '云南': '昆明市',
                '陕西': '西安市',
                '甘肃': '兰州市',
                '青海': '西宁市',
                '河北': '石家庄市',
                '山西': '太原市',
                '吉林': '长春市',
                '黑龙江': '哈尔滨市',
                '辽宁': '沈阳市'
            };

            // 提取省份名称（去掉"省"字）
            const provinceName = location.name.replace('省', '');
            if (provinceMap[provinceName]) {
                searchAddress = `${location.name}${provinceMap[provinceName]}`;
            }
        }

        // 确保地址格式规范
        searchAddress = searchAddress
            .replace(/自治区/g, '')  // 移除"自治区"
            .replace(/特别行政区/g, '') // 移除"特别行政区"
            .replace(/维吾尔/g, '')  // 移除民族名称
            .replace(/壮族/g, '')
            .replace(/回族/g, '')
            .trim();

        console.log(`正在解析地址: ${searchAddress}`); // 调试日志

        geocoder.getPoint(searchAddress, function(point) {
            if (point) {
                console.log(`成功解析地址: ${searchAddress}`, point); // 调试日志
                points.push(point);

                // 创建标记
                const marker = new BMap.Marker(point);
                const label = new BMap.Label(`${index + 1}. ${location.name}`, {
                    offset: new BMap.Size(20, -10)
                });
                marker.setLabel(label);
                
                mapMarkers.push(marker);
                baiduMap.addOverlay(marker);

                // 添加信息窗口
                const infoWindow = new BMap.InfoWindow(`
                    <div>
                        <p>地点：${location.name}</p>
                        <p>完整地址：${location.full_address}</p>
                        <p>人物：${person}</p>
                    </div>
                `);
                marker.addEventListener('click', function() {
                    this.openInfoWindow(infoWindow);
                });

                // 如果所有点都已添加，则绘制路线
                if (points.length === route.locations.length) {
                    // 绘制路线
                    polyline = new BMap.Polyline(points, {
                        strokeColor: "#3366FF",
                        strokeWeight: 3,
                        strokeOpacity: 0.8
                    });
                    
                    baiduMap.addOverlay(polyline);
                    
                    // 调整视图以显示所有点
                    baiduMap.setViewport(points);
                }
            } else {
                console.error(`无法���析地址: ${searchAddress}`); // 调试日志
            }
        });
    });
}

function clearMapOverlays() {
    // 清除现有标记
    mapMarkers.forEach(marker => {
        baiduMap.removeOverlay(marker);
    });
    mapMarkers = [];
    
    // 清除现有路线
    if (polyline) {
        baiduMap.removeOverlay(polyline);
        polyline = null;
    }
}

// 添加启用文本选择的函数
function enableTextSelection(element) {
    if (!element) return;
    
    // 移除之前的事件监听器（如果存在）
    if (element.textSelectionHandler) {
        element.removeEventListener('mouseup', element.textSelectionHandler);
    }
    
    // 添加新的事件监听器
    element.textSelectionHandler = function(event) {
        handleTextSelection.call(this, event);
    };
    element.addEventListener('mouseup', element.textSelectionHandler);
    
    // 确保元素可以选择文本
    element.style.userSelect = 'text';
    element.style.webkitUserSelect = 'text';
    element.style.mozUserSelect = 'text';
    element.style.msUserSelect = 'text';
}

// 添加禁用文本选择的函数
function disableTextSelection(element) {
    if (!element) return;
    
    // 移除事件监听器
    if (element.textSelectionHandler) {
        element.removeEventListener('mouseup', element.textSelectionHandler);
        element.textSelectionHandler = null;
    }
    
    // 禁用文本选择
    element.style.userSelect = 'none';
    element.style.webkitUserSelect = 'none';
    element.style.mozUserSelect = 'none';
    element.style.msUserSelect = 'none';
}

