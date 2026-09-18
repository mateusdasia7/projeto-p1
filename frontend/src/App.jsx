import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${API_URL}/api/tasks`);
      if (!res.ok) {
        throw new Error(`Código ${res.status}`);
      }
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error(err);
      setError('Não foi possível conectar ao servidor backend no Render.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      setError('');
      setSuccess('');
      const res = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description })
      });

      if (!res.ok) throw new Error('Falha ao adicionar a tarefa.');

      setTitle('');
      setDescription('');
      setSuccess('Tarefa salva com sucesso no MongoDB Atlas!');
      fetchTasks();
      setTimeout(() => setSuccess(''), 3500);
    } catch (err) {
      setError('Erro ao salvar tarefa no banco de dados.');
    }
  };

  const handleToggle = async (task) => {
    try {
      const res = await fetch(`${API_URL}/api/tasks/${task._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          completed: !task.completed
        })
      });
      if (!res.ok) throw new Error('Falha ao atualizar status.');
      fetchTasks();
    } catch (err) {
      setError('Erro ao atualizar status.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir esta tarefa?')) return;
    try {
      const res = await fetch(`${API_URL}/api/tasks/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Falha ao excluir.');
      fetchTasks();
    } catch (err) {
      setError('Erro ao excluir tarefa.');
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1>Projeto P1 — Hospedagem & Banco em Nuvem</h1>
        <p className="subtitle">Frontend Vercel • Backend Render • MongoDB Atlas</p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card">
        <h3>Adicionar Nova Tarefa</h3>
        <form onSubmit={handleAddTask} className="form">
          <div className="form-group">
            <label>Título da Tarefa *</label>
            <input
              type="text"
              placeholder="Ex: Criar cluster no MongoDB Atlas"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Descrição (opcional)</label>
            <textarea
              placeholder="Ex: Liberar IP 0.0.0.0/0 e copiar connection string"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Salvar Tarefa no Banco
          </button>
        </form>
      </div>

      <div className="card">
        <div className="list-header">
          <h3>Tarefas Cadastradas ({tasks.length})</h3>
          <button onClick={fetchTasks} className="btn btn-secondary" disabled={loading}>
            {loading ? 'Atualizando...' : '↻ Atualizar'}
          </button>
        </div>

        {loading && tasks.length === 0 ? (
          <p className="loading-text">Buscando dados no MongoDB Atlas...</p>
        ) : tasks.length === 0 ? (
          <p className="empty-text">Nenhuma tarefa cadastrada. Adicione uma acima!</p>
        ) : (
          <div className="task-list">
            {tasks.map((task) => (
              <div key={task._id} className={`task-item ${task.completed ? 'completed' : ''}`}>
                <div className="task-info">
                  <span className="task-title">{task.title}</span>
                  {task.description && <p className="task-desc">{task.description}</p>}
                  <small className="task-date">
                    Criado em: {new Date(task.createdAt).toLocaleString('pt-BR')}
                  </small>
                </div>
                <div className="task-actions">
                  <button
                    onClick={() => handleToggle(task)}
                    className={`btn-sm ${task.completed ? 'btn-reopen' : 'btn-check'}`}
                  >
                    {task.completed ? 'Desfazer' : '✓ Concluir'}
                  </button>
                  <button
                    onClick={() => handleDelete(task._id)}
                    className="btn-sm btn-delete"
                  >
                    ✕ Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="footer">
        <p>Atividade P1 • Engenharia de Software</p>
      </footer>
    </div>
  );
}
