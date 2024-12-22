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
    // 获取当前显示的文本内容
    const textArea = document.getElementById('text-area');
    const editableDiv = document.getElementById('editable-result');
    let text = '';
    
    if (textArea && textArea.style.display !== 'none') {
        text = textArea.value;
    } else if (editableDiv) {
        // 获取可编辑div的纯文本内容（去除HTML标签）
        text = editableDiv.innerText;
    }

    // 去除空格和换行符后计算字数
    const cleanText = text.replace(/[\s\n]/g, '');
    
    // 更新显示
    document.getElementById('word-count').innerText = `已输入 ${cleanText.length} 字`;
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
    const textArea = document.getElementById('text-area');
    const editableDiv = document.getElementById('editable-result');
    let newText = '';
        
    if (textArea && textArea.style.display !== 'none') {
        newText = textArea.value.trim();
    } else if (editableDiv) {
        newText = editableDiv.innerText.trim();
    }
    
    if (!newText) {
        alert('请输入文本进行实体识别');
        return;
    }

    if (newText !== originalText) {
        originalText = newText;
    }
    else if (entityCache) {
        // 检查缓存的文本是否与当前文本一致
        const cachedEntityTypes = Object.keys(entityCache.entities);
        const currentEntityTypes = entityTypes; // 使用当前的 entityTypes
        const entityTypesMatch = 
            cachedEntityTypes.length === currentEntityTypes.length && 
            cachedEntityTypes.every(type => currentEntityTypes.includes(type));

        if(entityTypesMatch){
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

    // 从entityData中删除实体
    const index = entityData[category].indexOf(entityText);
    if (index > -1) {
        entityData[category].splice(index, 1);
    }

    // 更新annotatedText
    annotatedText = editableDiv.innerHTML;

    // 更新侧边栏的实体统计
    updateSidebarEntities();

    // 如果知识图谱正在显示，则更新图谱
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

    // 从文本中删除所有相同的标注
    const editableDiv = document.getElementById('editable-result');
    const spans = editableDiv.querySelectorAll(`span[data-category="${category}"]`);
    spans.forEach(span => {
        if (span.textContent === entityText) {
            const textNode = document.createTextNode(span.textContent);
            span.parentNode.replaceChild(textNode, span);
        }
    });

    // 从entityData中删除实体
    const index = entityData[category].indexOf(entityText);
    if (index > -1) {
        entityData[category].splice(index, 1);
    }

    // 更新annotatedText
    annotatedText = editableDiv.innerHTML;

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
        // 使用缓存时，确保关系中的实体都存在于当前实体列表中
        relations = relationCache.relations.filter(rel => {
            const allEntities = Object.values(entityData).flat();
            return allEntities.includes(rel.source) && allEntities.includes(rel.target);
        });
        relationData = [...relations];
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
        // 过滤掉包含已删除实体的关系
        relations = data.relations.filter(rel => {
            const allEntities = Object.values(entityData).flat();
            return allEntities.includes(rel.source) && allEntities.includes(rel.target);
        });
        relationData = [...relations];
        
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
                        <img src="imges/编辑.png" 
                             alt="编辑" 
                             class="edit-btn" 
                             onclick="editRelation(this)"
                             title="编辑关系">
                        <img src="imges/删除.png" 
                             alt="删除" 
                             class="delete-btn" 
                             onclick="deleteRelation(this)"
                             title="删除关系">
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

// 添加删除关系函数
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

// 添加编辑关系函数
function editRelation(button) {
    const relationItem = button.closest('.relation-item');
    const index = Array.from(relationItem.parentElement.children).indexOf(relationItem) - 1;
    const relation = relations[index];

    // 创建模态框
    const modalHtml = `
        <div class="modal-overlay">
            <div class="relation-edit-modal">
                <div class="relation-edit-form">
                    <div class="form-group">
                        <label>源实体</label>
                        <input type="text" id="edit-source" value="${relation.source}">
                    </div>
                    <div class="form-group">
                        <label>关系类型</label>
                        <input type="text" id="edit-relation" value="${relation.relation}">
                    </div>
                    <div class="form-group">
                        <label>目标实体</label>
                        <input type="text" id="edit-target" value="${relation.target}">
                    </div>
                    <div class="modal-buttons">
                        <button class="modal-button cancel" onclick="closeEditModal()">取消</button>
                        <button class="modal-button save" onclick="saveRelation(${index})">保存</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeEditModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
}

function saveRelation(index) {
    const source = document.getElementById('edit-source').value;
    const relation = document.getElementById('edit-relation').value;
    const target = document.getElementById('edit-target').value;

    if (!source || !relation || !target) {
        alert('所有字段都必须填写');
        return;
    }

    // 更新关系数据
    relations[index] = { source, relation, target };
    relationData = [...relations];

    // 关闭模态框
    closeEditModal();

    // 重新渲染关系列表
    const sidebarContent = document.getElementById('sidebar-content');
    sidebarContent.innerHTML = `
        <div class="relation-list">
            <div class="entity-group-title">关系实例</div>
            ${relations.map(rel => `
                <div class="relation-item">
                    <span>${rel.source}</span>
                    <span style="margin: 0 8px">→</span>
                    <span>${rel.relation}</span>
                    <span style="margin: 0 8px">→</span>
                    <span>${rel.target}</span>
                    <img src="imges/编辑.png" 
                         alt="编辑" 
                         class="edit-btn" 
                         onclick="editRelation(this)"
                         title="编辑关系">
                    <img src="imges/删除.png" 
                         alt="删除" 
                         class="delete-btn" 
                         onclick="deleteRelation(this)"
                         title="删除关系">
                </div>
            `).join('')}
        </div>
    `;

    // 如果知识图谱正在显示，则更新图谱
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
                        <img src="imges/编辑.png" 
                             alt="编辑" 
                             class="edit-btn" 
                             onclick="editRelation(this)"
                             title="编辑关系">
                        <img src="imges/删除.png" 
                             alt="删除" 
                             class="delete-btn" 
                             onclick="deleteRelation(this)"
                             title="删除关系">
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
                length: 300  // 增加边的长度，使节点之间距更远
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
                randomSeed: 42      // 添加随机种子以获得致的布局
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
                            <div class="entity-name-container">
                                <span class="${getHighlightClass(category)} entity-name">${entity}</span>
                                <span class="entity-count">${countText}</span>
                            </div>
                            <div class="delete-btn-container">
                                <img src="imges/删除.png" 
                                     alt="删除" 
                                     class="delete-btn" 
                                     onclick="deleteEntityFromList(this, '${entity}', '${category}')"
                                     title="删除实体">
                            </div>
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

// 修改返回实体标注页面的函数
function returnToEntityAnnotation() {
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
    
    // 更新侧边栏显示实体列表
    updateSidebarEntities();
    
    // 确保文本框不可编辑
    const editableDiv = document.getElementById('editable-result');
    if (editableDiv) {
        editableDiv.contentEditable = 'false';
        editableDiv.addEventListener('input', preventEdit);
        
        // 如果已经进行过实体标注（通过检查是否存在实体数据）
        if (Object.values(entityData).some(arr => arr.length > 0)) {
            // 启用文本���择功能
            enableTextSelection(editableDiv);
            
            // 为已标注的实体添加右键菜单事件
            const entitySpans = editableDiv.querySelectorAll('span[data-category]');
            entitySpans.forEach(span => {
                span.addEventListener('contextmenu', function(event) {
                    handleEntityClick(this);
                    event.preventDefault();
                });
            });
        }
    }
    
    const textArea = document.getElementById('text-area');
    if (textArea) {
        textArea.readOnly = true;
        textArea.addEventListener('input', preventEdit);
    }
}

// 修改启文本选择的函数
function enableTextSelection(element) {
    if (!element) return;
    
    // 检查当前是否在关系标注页面
    const currentMode = document.querySelector('.nav-button.active').textContent.trim();
    if (currentMode.includes('关系标注')) {
        // 在关系标注页面禁用文本选择
        element.style.userSelect = 'none';
        element.style.webkitUserSelect = 'none';
        element.style.mozUserSelect = 'none';
        element.style.msUserSelect = 'none';
        return;
    }
    
    // 移除之前的事件监听器（如果存在）
    if (element.textSelectionHandler) {
        element.removeEventListener('mouseup', element.textSelectionHandler);
    }
    
    // 添加新的事件监听器
    element.textSelectionHandler = function(event) {
        handleTextSelection.call(this, event);
    };
    element.addEventListener('mouseup', element.textSelectionHandler);
    
    // 确保元素可以选择文本，但不可编辑
    element.style.userSelect = 'text';
    element.style.webkitUserSelect = 'text';
    element.style.mozUserSelect = 'text';
    element.style.msUserSelect = 'text';
    element.contentEditable = 'false';
    element.addEventListener('input', preventEdit);
}

// 修改处理文本选择的函数
function handleTextSelection() {
    // 检查当前是否在关系标注页面
    const currentMode = document.querySelector('.nav-button.active').textContent.trim();
    if (currentMode.includes('关系标注')) {
        return; // 在关系标注页面直接回，处理文本选择
    }
    
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    // 检查是否包含标点符号
    if (selectedText && !/[，。！？；：、]/.test(selectedText)) {
        // 获取选择的范围
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // 为选中的文本添加背景色
        const span = document.createElement('span');
        span.style.backgroundColor = '#e6f3ff';
        range.surroundContents(span);
        
        // 创建标注选项菜单
        showEntityMenu(rect.left, rect.bottom, selectedText, range);
        
        // 当菜单关闭时移除背景色并确保文本框保持不可编辑
        document.addEventListener('mousedown', function removeHighlight(e) {
            const menu = document.querySelector('.entity-selection-menu');
            if (!menu || !menu.contains(e.target)) {
                // 如果没有进行实体标注，则恢复原始文本
                if (span.getAttribute('data-category') === null) {
                    const text = span.textContent;
                    span.parentNode.replaceChild(document.createTextNode(text), span);
                }
                
                // 确保文本框保持不可编辑状态
                const editableDiv = document.getElementById('editable-result');
                if (editableDiv) {
                    editableDiv.contentEditable = 'false';
                    editableDiv.addEventListener('input', preventEdit);
                }
                
                document.removeEventListener('mousedown', removeHighlight);
            }
        });
    }
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
    // 初始化文本框状态
    const editableDiv = document.getElementById('editable-result');
    const textArea = document.getElementById('text-area');
    const currentMode = document.querySelector('.nav-button.active').textContent.trim();

    if (!currentMode.includes('结构标注')) {
        if (editableDiv) {
            editableDiv.contentEditable = 'false';
            editableDiv.addEventListener('input', preventEdit);
        }
        if (textArea) {
            textArea.readOnly = true;
            textArea.addEventListener('input', preventEdit);
        }
    }

    // 现有的导航按钮点击事件监听
    document.querySelectorAll('.nav-button').forEach(button => {
        button.addEventListener('click', function() {
            const currentMode = this.textContent.trim();
            const previousMode = document.querySelector('.nav-button.active').textContent.trim();
            handleNavButtonClick(this);

            // 隐藏地图容器
            const mapContainer = document.getElementById('map-container');
            if (mapContainer) {
                mapContainer.style.display = 'none';
                if (baiduMap) {
                    baiduMap.clearOverlays();
                }
            }

            // 隐藏知识图谱
            const graphContainer = document.getElementById('knowledge-graph');
            if (graphContainer) {
                graphContainer.style.display = 'none';
            }

            // 获取文本编辑区域容器
            const container = document.querySelector('.container');

            // 获取文本框元素
            const editableDiv = document.getElementById('editable-result');
            const textArea = document.getElementById('text-area');

            // 根据不同模式执行相应操作
            if (currentMode.includes('实体标注')) {
                container.style.display = 'block';
                // 确保文本框不可编辑
                if (editableDiv) {
                    editableDiv.contentEditable = 'false';
                    editableDiv.addEventListener('input', preventEdit);
                }
                if (textArea) {
                    textArea.readOnly = true;
                    textArea.addEventListener('input', preventEdit);
                }
                returnToEntityAnnotation();
            } else if (currentMode.includes('关系标注')) {
                container.style.display = 'block';
                // 确保文本框不可编辑
                if (editableDiv) {
                    editableDiv.contentEditable = 'false';
                    editableDiv.addEventListener('input', preventEdit);
                }
                if (textArea) {
                    textArea.readOnly = true;
                    textArea.addEventListener('input', preventEdit);
                }
                showRelationAnnotationUI();
            } else if (currentMode.includes('知识图谱')) {
                container.style.display = 'none';
                showKnowledgeGraph();
            } else if (currentMode.includes('地图轨迹')) {
                if (previousMode.includes('知识图谱')) {
                    container.style.display = 'none';
                    graphContainer.style.display = 'block';
                } else {
                    container.style.display = 'block';
                }
                showLocationTrajectory();
            } else if (currentMode.includes('导出数据')) {
                container.style.display = 'block';
                exportAllData();
            } else if (currentMode.includes('结构标注')) {
                container.style.display = 'block';
                // 在结构标注页面启用编辑
                if (editableDiv) {
                    editableDiv.contentEditable = 'true';
                    editableDiv.removeEventListener('input', preventEdit);
                }
                if (textArea) {
                    textArea.readOnly = false;
                    textArea.removeEventListener('input', preventEdit);
                }
                returnToStructureAnnotation();
            }
        });
    });
});

// 修改自动识别功能
async function autoRecognize() {
    // 获取当前激活的导航按钮文本
    const currentMode = document.querySelector('.nav-button.active').textContent.trim();
    
    // 显示加载动画
    document.getElementById('loading-spinner').style.display = 'block';
    toggleButtons(true);
    
    try {
        if (currentMode.includes('结构标注')) {
            // 结构标注页面 - 添加标点符号
            const text = document.getElementById('text-area').value;
            if (!text.trim()) {
                alert('请先输入文本内容');
                return;
            }
            
            const response = await fetch('http://localhost:5000/add_punctuation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: text })
            });
            
            const data = await response.json();
            if (response.ok) {
                document.getElementById('text-area').value = data.text;
                updateWordCount(); // 更新字数统计
            } else {
                throw new Error(data.error || '添加标点符号失败');
            }
        } else if (currentMode.includes('实体标注')) {
            // 保持原有的实体标注功能
            await performNER();
        } else if (currentMode.includes('关系标注')) {
            // 执行关系抽取
            await extractRelations();
            // 立即更新关系标注界面显示
            await showRelationAnnotation();
        }
    } catch (error) {
        console.error('自动识别错误:', error);
        alert(error.message || '自动识别失败，请稍后重试');
    } finally {
        // 隐藏加载动画
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
    
    // 获取当前模式
    const currentMode = document.querySelector('.nav-button.active').textContent.trim();
    const isStructureMode = currentMode.includes('结构标注');
    
    // 更新文本框内容，保持原始格式
    container.innerHTML = `
        <div class="icons">
            <img src="imges/搜索.png" alt="查询" title="查询" onclick="alert('执行查询功能')">
            <img src="imges/复制文件.png" alt="复制" title="复制" onclick="copyText()">
            <img src="imges/剪切.png" alt="剪切" title="剪切" onclick="cutText()">
            <img src="imges/paste.png" alt="粘贴" title="粘贴" onclick="pasteText()">
            <img src="imges/自动识别.png" alt="自动识别" title="自动识别" onclick="autoRecognize()" id="auto-recognize-btn">
        </div>
        <div class="separator"></div>
        <div class="annotated-text" id="editable-result" contenteditable="${isStructureMode}" ${!isStructureMode ? 'onInput="preventEdit(event)"' : ''}>${currentText}</div>
        <div class="word-count" id="word-count"></div>
    `;
    
    // 如果不是结构标注模式，添加事件监听器
    if (!isStructureMode) {
        const editableDiv = document.getElementById('editable-result');
        if (editableDiv) {
            editableDiv.addEventListener('input', preventEdit);
        }
    }
    
    // 更新字数统计
    const cleanText = currentText.replace(/<[^>]*>/g, '').replace(/[\s\n]/g, '');
    document.getElementById('word-count').innerText = `已输入 ${cleanText.length} 字`;
    
    // 清空侧边栏
    const sidebarContent = document.getElementById('sidebar-content');
    if (sidebarContent) {
        sidebarContent.innerHTML = '';
    }
}

// 修改显示关系标注UI的函数
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
                    <img src="imges/编辑.png" 
                         alt="编辑" 
                         class="edit-btn" 
                         onclick="editRelation(this)"
                         title="编辑关系">
                    <img src="imges/删除.png" 
                         alt="删除" 
                         class="delete-btn" 
                         onclick="deleteRelation(this)"
                         title="删除关系">
                </div>
            `).join('')}
        </div>
    `;
    
    // 确保文本框不可编辑且禁用文本选择
    const editableDiv = document.getElementById('editable-result');
    if (editableDiv) {
        editableDiv.contentEditable = 'false';
        editableDiv.addEventListener('input', preventEdit);
        editableDiv.style.userSelect = 'none';
        editableDiv.style.webkitUserSelect = 'none';
        editableDiv.style.mozUserSelect = 'none';
        editableDiv.style.msUserSelect = 'none';
    }
    
    const textArea = document.getElementById('text-area');
    if (textArea) {
        textArea.readOnly = true;
        textArea.addEventListener('input', preventEdit);
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
    
    // 将选中的内移动到新的span中
    range.surroundContents(span);
    
    // 添加右键点击事件
    span.addEventListener('contextmenu', function(event) {
        handleEntityClick(this);
        event.preventDefault(); // 阻止默认的右键菜单
    });
    
    // 更新侧边栏
    updateSidebarEntities();
    
    // 确保文本框保持不可编辑状态
    const editableDiv = document.getElementById('editable-result');
    if (editableDiv) {
        editableDiv.contentEditable = 'false';
        editableDiv.addEventListener('input', preventEdit);
    }
    
    // 保存带有标注的文本
    annotatedText = editableDiv.innerHTML;
}

function deleteEntityFromList(button, entity, category) {
    // 从实体数据中删除
    if (entityData[category]) {
        const index = entityData[category].indexOf(entity);
        if (index > -1) {
            entityData[category].splice(index, 1);
        }
    }

    // 从文本中删除标注
    const editableDiv = document.getElementById('editable-result');
    const spans = editableDiv.querySelectorAll(`span[data-category="${category}"]`);
    spans.forEach(span => {
        if (span.textContent === entity) {
            const textNode = document.createTextNode(span.textContent);
            span.parentNode.replaceChild(textNode, span);
        }
    });

    // 删除所有包含该实体的关系
    relations = relations.filter(rel => 
        rel.source !== entity && rel.target !== entity
    );
    relationData = [...relations]; // 更新relationData

    // 更新annotatedText
    annotatedText = editableDiv.innerHTML;

    // 更新侧边栏的实体统计
    updateSidebarEntities();

    // 如果知识图谱正在显示，则更新图谱
    const graphContainer = document.getElementById('knowledge-graph');
    if (graphContainer.style.display === 'block') {
        showKnowledgeGraph();
    }

    // 如果当前在关系标注页面，更新关系列表
    const currentMode = document.querySelector('.nav-button.active').textContent.trim();
    if (currentMode.includes('关系标注')) {
        showRelationAnnotation();
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
            throw new Error('获取人物迹失败');
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
        // 处理地址格式
        let searchAddress = location.full_address;
        
        // 如省地址，确保使用省会城市
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

                // 如果所有点都已加，则绘制路线
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
                console.error(`无法解析地址: ${searchAddress}`); // 调试日志
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

// 添加登出函数
function logout() {
    // 清除本地存储的用户信息
    localStorage.removeItem('token');
    localStorage.removeItem('user_id');
    // 跳转到登录页面
    window.location.href = './login/login.html';
}

// 添加阻止编辑的函数
function preventEdit(event) {
    event.preventDefault();
    alert('不能在结构标注页面进行编辑');
    // 恢复原始内容
    if (this.tagName.toLowerCase() === 'textarea') {
        this.value = this.defaultValue;
    } else {
        this.innerHTML = this.getAttribute('data-original-content') || this.innerHTML;
    }
}

// 添加实体类型函数
function addEntityType() {
    const newType = prompt('请输入新的实体类型名称：');
    if (newType && newType.trim()) {
        // 检查是否已存在该类型
        if (entityTypes.includes(newType)) {
            alert('该实体类型已存在！');
            return;
        }
        
        // 添加到实体类型数组
        entityTypes.push(newType);
        
        // 初始化新类型的实体数据
        entityData[newType] = [];
        
        // 更新侧边栏显示
        updateSidebarEntities();
        
        // 如果当前在实体标注模式，重新���染结果
        const currentMode = document.querySelector('.nav-button.active').textContent.trim();
        if (currentMode.includes('实体标注') && annotatedText) {
            const editableDiv = document.getElementById('editable-result');
            if (editableDiv) {
                renderNERResult(entityData);
            }
        }
    }
}

// 删除实体类型函数
function deleteEntityType(type) {
    // 确认是否删除
    if (!confirm(`确定要删除实体类型"${type}"吗？这将移除所有该类型的标注。`)) {
        return;
    }
    
    // 从类型数组中移除
    const index = entityTypes.indexOf(type);
    if (index > -1) {
        entityTypes.splice(index, 1);
        
        // 删除该类型的实体数据
        delete entityData[type];
        
        // 从文本中移除该类型的标注
        const editableDiv = document.getElementById('editable-result');
        if (editableDiv) {
            const spans = editableDiv.querySelectorAll(`span[data-category="${type}"]`);
            spans.forEach(span => {
                const textNode = document.createTextNode(span.textContent);
                span.parentNode.replaceChild(textNode, span);
            });
            
            // 更新annotatedText
            annotatedText = editableDiv.innerHTML;
        }
        
        // 更新侧边栏显示
        updateSidebarEntities();
    }
}

function setEntityStatus(entityText, category, status, menu) {
    // 关闭菜单
    menu.remove();
    
    // 更新所有匹配的实体元素的状态
    const editableDiv = document.getElementById('editable-result');
    const spans = editableDiv.querySelectorAll(`span[data-category="${category}"]`);
    
    spans.forEach(span => {
        if (span.textContent === entityText) {
            // 移除之前的状态
            span.removeAttribute('data-status');
            
            // 设置新状态
            if (status === 'unchecked') {
                span.setAttribute('data-status', 'unchecked');
            }
        }
    });
    
    // 更新 annotatedText
    annotatedText = editableDiv.innerHTML;
}

// 保存标注结果到服务器
async function saveAnnotationResults() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const documentId = urlParams.get('documentId');
        if (!documentId) {
            console.error('未找到文档ID');
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            console.error('未找到认证token');
            return;
        }

        // 获取当前文档的所有标注数据
        const editableDiv = document.getElementById('editable-result');
        const textArea = document.getElementById('text-area');
        
        const dataToSave = {
            name: document.title,
            description: '',
            original_text: originalText,
            annotated_text: editableDiv ? editableDiv.innerHTML : '',
            entity_data: entityData || {},
            relation_data: relationData || []
        };

        // 发送保存请求
        const saveResponse = await fetch(`http://localhost:5000/api/documents/${documentId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dataToSave)
        });

        if (!saveResponse.ok) {
            throw new Error('保存标注结果失败');
        }

        console.log('标注结果保存成功');
        return true;

    } catch (error) {
        console.error('保存标注结果错误:', error);
        return false;
    }
}

// 加载标注结果
async function loadAnnotationResults() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const documentId = urlParams.get('documentId');
        if (!documentId) {
            console.error('未找到文档ID');
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            console.error('未找到认证token');
            return;
        }

        const response = await fetch(`http://localhost:5000/api/documents/${documentId}`, {
            method: 'GET',  // 显式指定请求方法
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('获取标注结果失败');
        }

        const data = await response.json();
        
        // 添加数据验证
        if (!data || typeof data !== 'object') {
            throw new Error('无效的数据格式');
        }
        
        // 安全地解析JSON数据
        if (data.original_text) {
            originalText = data.original_text;
            annotatedText = data.annotated_text;
            entityData = data.entity_data;
            relationData = data.relation_data;

            // 显示已有的标注结果
            const textArea = document.getElementById('text-area');
            textArea.value = originalText;
            
            if (annotatedText) {
                renderNERResult(entityData);
            }
        }
        /*try {
            entityData = data.entity_data || {};
                
            // 验证entityData格式
            if (typeof entityData !== 'object') {
                entityData = {};
            }
            
            relationData = data.relation_data || [];
                
            // 验证relationData格式
            if (!Array.isArray(relationData)) {
                relationData = [];
            }
        } catch (error) {
            console.error('数据格式错误:', error);
            entityData = {};
            relationData = [];
        }

        // 显示文本内容
        const textArea = document.getElementById('text-area');
        if (textArea) {
            textArea.value = originalText;
        }

        // 如果有标注结果，显示标注
        const editableDiv = document.getElementById('editable-result');
        if (editableDiv && annotatedText) {
            editableDiv.innerHTML = annotatedText;
            
            // 为已标注的实体添加事件监听器
            const entitySpans = editableDiv.querySelectorAll('span[data-category]');
            entitySpans.forEach(span => {
                span.addEventListener('contextmenu', function(event) {
                    handleEntityClick(this);
                    event.preventDefault();
                });
            });
        }
        */
        // 更新侧边栏
        //updateSidebarEntities();

    } catch (error) {
        console.error('加载标注结果错误:', error);
        alert('加载标注结果失败，请稍后重试');
    }
}

// 在页面加载完成后调用
document.addEventListener('DOMContentLoaded', () => {
    loadAnnotationResults();

    // 在页面关闭或刷新前保存
    window.addEventListener('beforeunload', async (event) => {
        event.preventDefault();
        event.returnValue = ''; // 显示确认对话框
        
        // 保存标注结果
        await saveAnnotationResults();
    });
});

// 添加返回文件管理页面的函数
function returnToFileManagement() {
    // 获取当前URL中的projectId
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('projectId');
    
    // 跳转到project.html页面，并保持projectId参数
    window.location.href = `project.html?projectId=${projectId}`;
}

