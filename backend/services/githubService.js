// services/githubService.js

const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs/promises'); 
const llmService = require('./llmService');

// Root folder where repositories will be cloned
const REPOS_ROOT_DIR = process.env.REPOS_ROOT_DIR;

// Ensure a directory exists
async function ensureDir(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
        console.log("Directory OK:", dirPath);
    } catch (err) {
        console.error("Failed to create directory:", dirPath, err);
    }
}

async function startReviewProcess(payload, githubPat) {
    const { repository, commit_sha, changed_files, pull_request_number } = payload;

    const repoURL = `https://x-access-token:${githubPat}@github.com/${repository}.git`;

    // Extract repo name e.g. "user/NetReaper" → "NetReaper"
    const repoName = repository.split('/')[1];
    const localRepoPath = path.join(REPOS_ROOT_DIR, repoName);

    // --- Ensure REPOS_ROOT_DIR exists ---
    await ensureDir(REPOS_ROOT_DIR);

    // --- Remove old clone if it exists ---
    try {
        await fs.stat(localRepoPath);
        console.log("Removing previous repo:", localRepoPath);
        await fs.rm(localRepoPath, { recursive: true, force: true });
    } catch {
        console.log("No previous repo clone found, proceeding fresh.");
    }

    // --- Clone repository (non-bare) ---
    console.log("Cloning repository:", repoURL);
    await simpleGit().clone(repoURL, localRepoPath);

    const git = simpleGit(localRepoPath);

    // --- Checkout specific commit ---
    console.log("Checking out commit:", commit_sha);
    await git.checkout(commit_sha);

    // --- Collect diffs for changed files ---
    const filesToReview = [];
    for (const file of changed_files) {
        const filePath = file.filename;

        // Compare commit with its parent
        const diff = await git.diff(['HEAD^', 'HEAD', '--', filePath]);

        if (diff && diff.trim() !== "") {
            filesToReview.push({
                filename: filePath,
                diffContent: diff
            });
        }
    }

    console.log(`Found ${filesToReview.length} changed files.`);

    // --- Generate AI Review ---
    const reviewMarkdown = await llmService.getAIReview(
        filesToReview,
        repository,
        pull_request_number
    );

    // --- Post Comment to GitHub ---
    const success = await postGitHubComment(
        repository,
        pull_request_number,
        reviewMarkdown,
        githubPat
    );

    return success;
}

// --- Post comment on PR ---
async function postGitHubComment(repoName, prNumber, content, githubToken) {
    const url = `https://api.github.com/repos/${repoName}/issues/${prNumber}/comments`;

    const headers = {
        "Authorization": `token ${githubToken}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "AI-Code-Review-Bot"
    };

    const body = `## 🤖 Gemini AI Code Review\n\n---\n\n${content}`;

    try {
        const fetch = require('node-fetch');

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ body })
        });

        if (response.status === 201) {
            console.log("Successfully posted AI review comment.");
            return true;
        } else {
            const errText = await response.text();
            console.error(`Failed to post comment (${response.status}):`, errText);
            return false;
        }
    } catch (error) {
        console.error("Error posting GitHub comment:", error);
        return false;
    }
}

module.exports = {
    startReviewProcess
};
// services/llmService.js