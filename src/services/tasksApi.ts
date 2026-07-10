import { API_BASE } from '../constants/api';

const TASKS_BASE = `${API_BASE}/tasks`;

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done' | 'blocked';
  priority: 'low' | 'medium' | 'high';
  assignee: string;
  tags: string[];
  dueDate: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: 'todo' | 'in_progress' | 'done' | 'blocked';
  priority?: 'low' | 'medium' | 'high';
  assignee?: string;
  tags?: string[];
  dueDate?: string;
  projectId: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: 'todo' | 'in_progress' | 'done' | 'blocked';
  priority?: 'low' | 'medium' | 'high';
  assignee?: string;
  tags?: string[];
  dueDate?: string;
}

export async function getAllTasks(projectId?: string): Promise<{ data: Task[] }> {
  const url = new URL(TASKS_BASE, window.location.origin);
  if (projectId) url.searchParams.set('projectId', projectId);
  const response = await fetch(url.toString());
  return response.json();
}

export async function getTaskById(id: string): Promise<{ data: Task }> {
  const response = await fetch(`${TASKS_BASE}/${id}`);
  return response.json();
}

export async function createTask(input: CreateTaskInput): Promise<{ data: Task }> {
  const response = await fetch(TASKS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return response.json();
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<{ data: Task }> {
  const response = await fetch(`${TASKS_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return response.json();
}

export async function deleteTask(id: string): Promise<{ data: { success: boolean } }> {
  const response = await fetch(`${TASKS_BASE}/${id}`, { method: 'DELETE' });
  return response.json();
}

export async function migrateTasks(tasks: Partial<Task>[]): Promise<{ data: Task[] }> {
  const response = await fetch(`${TASKS_BASE}/migrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks }),
  });
  return response.json();
}