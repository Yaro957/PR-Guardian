// services/githubService.js

const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs/promises'); // Use promises for async file operations
const llmService = require('./llmService'); // Will be defined next

const REPOS_ROOT_DIR = process.env.REPOS_ROOT_DIR;

// Ensures the root directory for clones exists
async function ensureRepoDir(repoPath) {
    await fs.mkdir(repoPath, { recursive: true });
}

    const { repository, commit_sha, changed_files, pull_request_number } = payload;
    const repoURL = `https://x-access-token:${githubPat}@github.com/${repository}.git`;
    
    // Use the last part of the repo name for the local folder (e.g., 'user/repo' -> 'repo')
    const repoName = repository.split('/')[1];
    const localRepoPath = path.join(REPOS_ROOT_DIR, repoName);
    
    // 1. CLONE OR UPDATE REPOSITORY
    // ---
    await ensureRepoDir(REPOS_ROOT_DIR);
    let git;

    if (await fs.stat(localRepoPath).catch(() => false)) {
        // Repository exists, just fetch and reset to the commit
        console.log(`Updating local clone: ${localRepoPath}`);
        git = simpleGit(localRepoPath);
        await git.fetch();
    } else {
        // Repository does not exist, clone it
        console.log(`Cloning repository: ${repoURL}`);
        await simpleGit().clone(repoURL, localRepoPath, ['--bare']); // Use bare clone for efficiency
        git = simpleGit(localRepoPath);
    }

    // Check out the specific commit the PR is on
    await git.checkout(commit_sha);
    console.log(`Checked out commit: ${commit_sha}`);


    // 2. GET DIFFS AND CONSTRUCT CONTEXT
    // ---
    const filesToReview = [];
    
    for (const file of changed_files) {
        const filePath = file.filename;
        
        // Get the diff between the current commit (HEAD) and its parent (HEAD^)
        // This is the core logic for getting "only changed files" (Step 2)
        const diff = await git.diff(['HEAD^', 'HEAD', '--', filePath]);
        
        if (diff) {
            filesToReview.push({ filename: filePath, diffContent: diff });
        }
    }
    
    console.log(`Found ${filesToReview.length} files with changes to review.`);

    // 3. CALL LLM SERVICE
    // ---
    const reviewMarkdown = await llmService.getAIReview(
        filesToReview, 
        repository, 
        pull_request_number
    );

    // 4. POST COMMENT TO GITHUB
    // ---
    const success = await postGitHubComment(repository, pull_request_number, reviewMarkdown, githubPat);
    
    return success;

async function startReviewProcess(payload, githubPat) {
    const { repository, commit_sha, changed_files, pull_request_number } = payload;
    const repoURL = `https://x-access-token:${githubPat}@github.com/${repository}.git`;

    const repoName = repository.split('/')[1];
    const localRepoPath = path.join(REPOS_ROOT_DIR, repoName);

    // --- Ensure REPOS_ROOT_DIR exists ---
    try {
        await fs.mkdir(REPOS_ROOT_DIR, { recursive: true });
        console.log("Repo root OK:", REPOS_ROOT_DIR);
    } catch (err) {
        console.error("Failed to create repo root:", err);
    }

    // --- If repo folder exists, remove it (clean state) ---
    try {
        await fs.stat(localRepoPath);
        console.log("Removing old repo folder:", localRepoPath);
        await fs.rm(localRepoPath, { recursive: true, force: true });
    } catch {
        console.log("No previous repo clone found.");
    }

    // --- Clone repository (non-bare!) ---
    console.log("Cloning repository:", repoURL);
    await simpleGit().clone(repoURL, localRepoPath);
    const git = simpleGit(localRepoPath);

    // --- Checkout specific commit ---
    console.log("Checking out commit:", commit_sha);
    await git.checkout(commit_sha);

    // --- DIFF ---
    const filesToReview = [];
    for (const file of changed_files) {
        const filePath = file.filename;
        const diff = await git.diff(['HEAD^', 'HEAD', '--', filePath]);
        if (diff) {
            filesToReview.push({ filename: filePath, diffContent: diff });
        }
    }

    console.log(`Found ${filesToReview.length} changed files.`);

    // --- LLM ---
    const reviewMarkdown = await llmService.getAIReview(
        filesToReview,
        repository,
        pull_request_number
    );

    // --- POST COMMENT ---
    const success = await postGitHubComment(
        repository,
        pull_request_number,
        reviewMarkdown,
        githubPat
    );

    return success;
}


// --- GitHub Comment Posting Logic ---
async function postGitHubComment(repoName, prNumber, content, githubToken) {
    const url = `https://api.github.com/repos/${repoName}/issues/${prNumber}/comments`;
    
    const headers = {
        "Authorization": `token ${githubToken}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "AI-Code-Review-Bot"
    };
    
    const body = `## 🤖 Gemini AI Code Review\n\n---\n\n${content}`;
    
    try {
        // Using a basic fetch for simplicity in Node.js
        const fetch = require('node-fetch'); 
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ body: body })
        });

        if (response.status === 201) {
            console.log("Successfully posted comment to GitHub.");
            return true;
        } else {
            const errorText = await response.text();
            console.error(`Failed to post comment (${response.status}): ${errorText}`);
            return false;
        }
    } catch (error) {
        console.error('Error posting comment:', error);
        return false;
    }
}

module.exports = {
    startReviewProcess
};