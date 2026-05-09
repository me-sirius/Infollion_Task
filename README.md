# React Spreadsheet Engine

A lightweight, React-based spreadsheet application that supports direct data entry and formula evaluation, similar to basic Excel functionality. Built as part of a software developer intern assignment.

## ✨ Features

- **Editable Grid**: Starts with a 10x10 grid of cells (A-J, 1-10) with support for text and numeric values.
- **Formula Evaluation**: Type `=` to start a formula (e.g., `=A1+B2` or `=(C1+D1)/3`). Supports basic arithmetic operations (`+`, `-`, `*`, `/`) and parentheses.
- **Dependency Management**: Automatically recalculates and updates dependent cells when referenced values change.
- **Circular Reference Detection**: Safely detects infinite loops and displays a `#CIRCULAR` error without freezing the app.
- **Error Handling**: Displays an `#ERROR` indicator for invalid formulas or unknown references.
- **Keyboard Navigation**: Use arrow keys to navigate between cells, `Enter` or `F2` to edit, and `Delete` to clear a cell.
- **Undo/Redo**: Easily revert or reapply changes using the UI buttons or standard keyboard shortcuts (`Ctrl+Z` / `Ctrl+Y`).
- **Dynamic Grid Sizing**: Expand the grid by adding more rows and columns dynamically.

## 🚀 Tech Stack

- **React** (UI and state management)
- **Vite** (Build tool and development server)
- **Tailwind CSS** (Styling)

## 📂 Key Project Files

The core logic of the application is broken down into four main files:
- `src/components/Spreadsheet.jsx`: The main grid component handling UI layout, keyboard navigation, and global interactions.
- `src/components/Cell.jsx`: The individual cell component responsible for displaying values and handling the edit state.
- `src/utils/formulaEngine.js`: The heart of the application. It contains the pure functions needed to tokenize, parse formulas into an Abstract Syntax Tree (AST), build dependency graphs, detect cycles, and evaluate the final values.
- `src/hooks/useUndoableState.js`: A custom React hook that manages the history stack to provide seamless undo and redo capabilities.

## 🛠️ Installation & Setup

1. **Clone the repository**.
2. **Navigate to the frontend folder**:
   ```bash
   cd frontend
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Start the development server**:
   ```bash
   npm run dev
   ```
5. Open your browser and visit the local URL provided in the terminal (usually `http://localhost:5173`).