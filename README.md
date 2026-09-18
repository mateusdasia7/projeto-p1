# Projeto P1 — Hospedagem & Banco de Dados em Nuvem

Este projeto foi construído para atender 100% aos critérios da atividade P1:
- Frontend em React + Vite (pronto para Vercel)
- Backend em Node.js + Express + Mongoose (pronto para Render)
- Banco de Dados em Nuvem (MongoDB Atlas)

---

## 🚀 PASSO A PASSO PARA PUBLICAR:

### 1. MongoDB Atlas (Banco de Dados em Nuvem)
1. Acesse: https://www.mongodb.com/cloud/atlas e crie sua conta gratuita.
2. Crie um cluster gratuito (**M0 Free**).
3. No menu lateral, em **Database Access**:
   - Clique em **Add New Database User**.
   - Defina um usuário (ex: `admin`) e uma senha simples (ex: `senha123456`). Guarde a senha!
4. No menu lateral, em **Network Access**:
   - Clique em **Add IP Address**.
   - Selecione **Allow Access From Anywhere** (`0.0.0.0/0`) e confirme.
5. Volte para **Database** > Clique em **Connect** > Selecione **Drivers** (Node.js).
6. Copie a Connection String. Substitua `<password>` pela senha que você criou.
   Exemplo: `mongodb+srv://admin:senha123456@cluster0.mongodb.net/projetoP1?retryWrites=true&w=majority`

---

### 2. Subir o Projeto para o GitHub
1. Crie um novo repositório vazio no seu GitHub.
2. Descompacte este arquivo zip no seu computador.
3. Abra o terminal/Prompt dentro da pasta do projeto e execute:
   ```bash
   git init
   git add .
   git commit -m "Projeto P1 Hospedagem e Banco em Nuvem"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
   git push -u origin main
   ```

---

### 3. Publicar o Backend no Render
1. Acesse: https://dashboard.render.com/ e entre com o GitHub.
2. Clique em **New +** > **Web Service**.
3. Selecione o repositório que você subiu no GitHub.
4. Preencha os campos exatamente assim:
   - **Name**: `backend-p1`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. Na seção **Environment Variables**, adicione:
   - **Key**: `MONGODB_URI`
   - **Value**: A sua Connection String do MongoDB Atlas (Passo 1).
6. Clique em **Deploy Web Service**.
7. Quando finalizar o deploy, copie a URL pública gerada no topo (ex: `https://backend-p1-xxxx.onrender.com`).

---

### 4. Publicar o Frontend na Vercel
1. Acesse: https://vercel.com/ e entre com o GitHub.
2. Clique em **Add New...** > **Project**.
3. Importe o repositório do GitHub.
4. Ajuste as configurações:
   - **Root Directory**: Clique em **Edit** e selecione a pasta `frontend`.
   - **Framework Preset**: `Vite` (reconhecido automaticamente).
5. Na seção **Environment Variables**:
   - **Key**: `VITE_API_URL`
   - **Value**: A URL do seu backend no Render (ex: `https://backend-p1-xxxx.onrender.com` — sem barra no final).
6. Clique em **Deploy**.
7. A Vercel fornecerá a URL pública do seu frontend (ex: `https://frontend-p1-xxxx.vercel.app`).
