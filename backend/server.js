// server.js

const express = require('express');
const dotenv = require('dotenv');
const githubService = require('./services/githubService'); // Import the service
const app = express();

// Load environment variables from .env file
dotenv.config();

const PORT = process.env.PORT || 3000;

// Middleware to parse incoming JSON payloads (needed for the GitHub Action data)
app.use(express.json());

// --- The main endpoint for the GitHub Action ---
app.post('/webhook', async (req, res) => {
    console.log('--- Received AI Review Request ---');

    // 1. Get the payload from the GitHub Action
    const payload = req.body;
    const { repository, pull_request_number, commit_sha, changed_files } = payload;
    
    // Basic validation
    if (!repository || !pull_request_number || !commit_sha || !changed_files) {
        return res.status(400).send({ error: 'Missing required payload fields.' });
    }

    console.log(`Repo: ${repository}, PR: #${pull_request_number}, Commit: ${commit_sha}`);

    try {
        // 2. Initialize the main review process
        // We pass the payload and the GitHub token from the environment
        const reviewResult = await githubService.startReviewProcess(
            payload, 
            process.env.GITHUB_PAT
        );

        // 3. Respond immediately to the GitHub Action (async processing continues)
        // This is crucial to prevent the GitHub Action from timing out.
        res.status(202).send({ 
            message: 'Review request accepted. Processing started.',
            reviewId: commit_sha // Use commit_sha as a simple ID
        });
        
    } catch (error) {
        console.error('Error processing review request:', error);
        // Still send a 202 if possible, but log the error
        // Note: For a true failure, you might want to post an error comment to the PR
        res.status(500).send({ error: 'Internal server error during processing.' });
    }
});


// Start the server
app.listen(PORT, () => {
    console.log(`🤖 AI Review Backend running on port ${PORT}`);
    console.log(`GitHub Action should send payload to: http://<YOUR_SERVER_IP>:${PORT}/webhook`);
});

// A simple health check
app.get('/health', (req, res) => {
    res.status(200).send({ status: 'ok', message: 'AI Reviewer is alive!' });
});