// services/githubService.js

const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs/promises');
const llmService = require('./llmService');

const REPOS_ROOT_DIR = process.env.REPOS_ROOT_DIR;

// Ensure directory exists
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

    // Example: "Yaro957/NetReaper" → "NetReaper"
    const repoName = repository.split('/')[1];
    const localRepoPath = path.join(REPOS_ROOT_DIR, repoName);

    // --- Ensure root directory exists ---
    await ensureDir(REPOS_ROOT_DIR);

    // --- Remove old clone if exists ---
    try {
        await fs.stat(localRepoPath);
        console.log("Removing previous repo:", localRepoPath);
        await fs.rm(localRepoPath, { recursive: true, force: true });
    } catch {
        console.log("No previous repo clone found, fresh clone will be created.");
    }

    // --- Clone repository ---
    console.log("Cloning repository:", repoURL);
    await simpleGit().clone(repoURL, localRepoPath);

    const git = simpleGit(localRepoPath);

    // --- Checkout correct commit ---
    console.log("Checking out commit:", commit_sha);
    await git.checkout(commit_sha);

    // --- Generate diffs ---
    const filesToReview = [];
    for (const file of changed_files) {
        const filePath = file.filename;

        // Diff commit vs parent
        const diff = await git.diff(['HEAD^', 'HEAD', '--', filePath]);

        if (diff && diff.trim()) {
            filesToReview.push({
                filename: filePath,
                diffContent: diff
            });
        }
    }

    console.log(`Found ${filesToReview.length} changed files.`);

    // --- Get structured AI review ---
    const reviewMarkdown = await llmService.getAIReview(
        filesToReview,
        repository,
        pull_request_number
    );

    // --- Post comment on PR ---
    const success = await postGitHubComment(
        repository,
        pull_request_number,
        reviewMarkdown,
        githubPat
    );

    return success;
}

// --- Post comment to PR using Node-native fetch ---
async function postGitHubComment(repoName, prNumber, content, githubToken) {
    const url = `https://api.github.com/repos/${repoName}/issues/${prNumber}/comments`;

    const headers = {
        "Authorization": `token ${githubToken}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "AI-Code-Review-Bot"
    };

    const body = {
        body: `## 🤖 Gemini AI Code Review\n\n---\n\n${content}`
    };

    try {
        // Node 18+ built-in fetch (NO require!)
        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body)
        });

        if (response.status === 201) {
            console.log("Successfully posted AI review comment to GitHub.");
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
