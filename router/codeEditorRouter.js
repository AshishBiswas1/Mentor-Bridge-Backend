const express = require('express');
const codeEditorController = require('../controller/codeEditorController');

const router = express.Router();

// Public endpoint to initialize/sync the collaborative editor for a session
router.post('/create', codeEditorController.createCollaborativeEditor);
// Execute python code (returns stdout/stderr)
router.post('/run', codeEditorController.runCode);

module.exports = router;
