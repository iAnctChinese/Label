import request from '../utils/request'

export function login(data) {
  return request.post('/admin/login', data)
}

export function checkAuth() {
  return request.get('/admin/check')
}

export function getUsers() {
  return request.get('/users')
}

export function createUser(data) {
  return request.post('/users', data)
}

export function updateUser(id, data) {
  return request.put(`/users/${id}`, data)
}

export function deleteUser(id) {
  return request.delete(`/users/${id}`)
}

export function getProjects() {
  return request.get('/projects')
}

export function createProject(data) {
  return request.post('/projects', data)
}

export function updateProject(id, data) {
  return request.put(`/projects/${id}`, data)
}

export function deleteProject(id) {
  return request.delete(`/projects/${id}`)
}

export function getDocuments(params) {
  return request.get('/documents', { params })
}

export function createDocument(data) {
  return request.post('/documents', data)
}

export function updateDocument(id, data) {
  return request.put(`/documents/${id}`, data)
}

export function deleteDocument(id) {
  return request.delete(`/documents/${id}`)
}

export function getLogs(params) {
  return request.get('/logs', { params })
}

export function exportLogs() {
  return request.get('/logs/export')
}

export function getStats() {
  return request.get('/stats')
}
