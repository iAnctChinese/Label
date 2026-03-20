<template>
  <div class="documents-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <span>文档列表</span>
            <el-select 
              v-model="selectedProject" 
              placeholder="筛选项目" 
              clearable
              style="margin-left: 20px; width: 200px"
              @change="fetchDocuments"
            >
              <el-option 
                v-for="p in projects" 
                :key="p.id" 
                :label="p.name" 
                :value="p.id" 
              />
            </el-select>
          </div>
          <el-button type="primary" @click="showDialog()">
            <el-icon><Plus /></el-icon>
            添加文档
          </el-button>
        </div>
      </template>

      <el-table :data="documents" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="文档名称" width="200" />
        <el-table-column prop="project_name" label="所属项目" width="150" />
        <el-table-column prop="owner_name" label="创建者" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button size="small" @click="showDialog(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog 
      v-model="dialogVisible" 
      :title="isEdit ? '编辑文档' : '添加文档'"
      width="600px"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="80px">
        <el-form-item label="文档名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入文档名称" />
        </el-form-item>
        <el-form-item label="所属项目" prop="project_id">
          <el-select v-model="form.project_id" placeholder="请选择项目" style="width: 100%">
            <el-option 
              v-for="p in projects" 
              :key="p.id" 
              :label="p.name" 
              :value="p.id" 
            />
          </el-select>
        </el-form-item>
        <el-form-item label="内容" prop="content">
          <el-input 
            v-model="form.content" 
            type="textarea" 
            :rows="6"
            placeholder="请输入文档内容" 
          />
        </el-form-item>
        <el-form-item label="状态" prop="status" v-if="isEdit">
          <el-select v-model="form.status" placeholder="请选择状态">
            <el-option label="草稿" value="draft" />
            <el-option label="已发布" value="published" />
            <el-option label="已归档" value="archived" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { getDocuments, createDocument, updateDocument, deleteDocument, getProjects } from '../api'

const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const documents = ref([])
const projects = ref([])
const selectedProject = ref(null)
const formRef = ref()
const currentId = ref(null)

const form = reactive({
  name: '',
  content: '',
  project_id: null,
  status: 'draft'
})

const rules = {
  name: [{ required: true, message: '请输入文档名称', trigger: 'blur' }],
  project_id: [{ required: true, message: '请选择项目', trigger: 'change' }]
}

const formatTime = (time) => {
  if (!time) return ''
  return new Date(time).toLocaleString('zh-CN')
}

const getStatusType = (status) => {
  const types = {
    draft: 'info',
    published: 'success',
    archived: 'warning'
  }
  return types[status] || 'info'
}

const getStatusText = (status) => {
  const texts = {
    draft: '草稿',
    published: '已发布',
    archived: '已归档'
  }
  return texts[status] || status
}

const fetchProjects = async () => {
  try {
    projects.value = await getProjects()
  } catch (error) {
    console.error(error)
  }
}

const fetchDocuments = async () => {
  loading.value = true
  try {
    const params = selectedProject.value ? { project_id: selectedProject.value } : {}
    documents.value = await getDocuments(params)
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

const showDialog = (row = null) => {
  isEdit.value = !!row
  if (row) {
    currentId.value = row.id
    form.name = row.name
    form.content = row.content || ''
    form.project_id = row.project_id
    form.status = row.status
  } else {
    currentId.value = null
    form.name = ''
    form.content = ''
    form.project_id = selectedProject.value || null
    form.status = 'draft'
  }
  dialogVisible.value = true
}

const handleSubmit = async () => {
  await formRef.value.validate()
  
  submitting.value = true
  try {
    if (isEdit.value) {
      await updateDocument(currentId.value, form)
      ElMessage.success('更新成功')
    } else {
      await createDocument(form)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchDocuments()
  } catch (error) {
    console.error(error)
  } finally {
    submitting.value = false
  }
}

const handleDelete = (row) => {
  ElMessageBox.confirm('确定要删除该文档吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await deleteDocument(row.id)
      ElMessage.success('删除成功')
      fetchDocuments()
    } catch (error) {
      console.error(error)
    }
  })
}

onMounted(() => {
  fetchProjects()
  fetchDocuments()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
}
</style>
