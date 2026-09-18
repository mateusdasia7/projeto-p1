require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Task = require("./models/Task");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const mongoURI = process.env.MONGODB_URI;
if (!mongoURI) {
  console.warn("AVISO: MONGODB_URI não foi definida nas variáveis de ambiente!");
} else {
  mongoose
    .connect(mongoURI)
    .then(() => console.log("Conectado ao MongoDB Atlas com sucesso!"))
    .catch((err) => console.error("Erro ao conectar ao MongoDB Atlas:", err.message));
}

app.get("/", (req, res) => {
  res.json({
    status: "OK",
    message: "API P1 funcionando perfeitamente!",
    database: mongoose.connection.readyState === 1 ? "Conectado" : "Desconectado",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/tasks", async (req, res) => {
  try {
    const tasks = await Task.find().sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar tarefas.", details: error.message });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title || title.trim() === "") {
      return res.status(400).json({ error: "O título é obrigatório." });
    }
    const newTask = new Task({
      title: title.trim(),
      description: description ? description.trim() : ""
    });
    await newTask.save();
    res.status(201).json(newTask);
  } catch (error) {
    res.status(500).json({ error: "Erro ao salvar tarefa.", details: error.message });
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  try {
    const { title, description, completed } = req.body;
    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      { title, description, completed },
      { new: true }
    );
    if (!updatedTask) {
      return res.status(404).json({ error: "Tarefa não encontrada." });
    }
    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar tarefa.", details: error.message });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const deletedTask = await Task.findByIdAndDelete(req.params.id);
    if (!deletedTask) {
      return res.status(404).json({ error: "Tarefa não encontrada." });
    }
    res.json({ message: "Tarefa excluída com sucesso!" });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir tarefa.", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
