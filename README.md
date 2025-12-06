
# 🛡️ PR-Guardian

### **AI-Powered Automated Pull Request Code Reviewer**

PR-Guardian is an intelligent GitHub-integrated service that automatically reviews every pull request using **Google Gemini**, performs security + code quality analysis, and posts structured findings as a comment on the PR.

No manual setup in each project — just add a workflow file, and PR-Guardian handles the rest.

---

## 🚀 What PR-Guardian Does

When someone creates or updates a pull request:

1. **GitHub Action triggers** and collects changed files
2. It sends the data to **PR-Guardian backend**
3. Backend **clones the repo**, checks out the commit, and generates diffs
4. **Gemini AI analyzes the code**, finds vulnerabilities + issues
5. PR-Guardian **posts a detailed review comment** back on the PR

You get:

* 🔍 Security analysis
* 🧹 Code quality review
* 🏗️ Architecture suggestions
* ⚠️ Severity scoring
* 📝 Fix recommendations

All automatically — every time.

---

## 🧠 Architecture Overview

```
GitHub Repo → GitHub Actions → PR-Guardian Backend → Gemini AI → GitHub PR Comment
```

### Backend Responsibilities

* Receive webhook payload
* Clone repo + checkout commit
* Generate diffs for changed files
* Send structured analysis request to Gemini
* Convert AI output into GitHub-ready Markdown
* Post review comment to the PR

### AI Responsibilities

* Security vulnerability detection
* Code smells and quality issues
* Performance pitfalls
* Architecture & design problems
* Best practices
* Auto-generated fixes

---

## ⚙️ GitHub Action (Add This to Any Repo)

To enable PR-Guardian in any project, add:

**`.github/workflows/code-review.yml`**

```yaml
name: AI Code Review Trigger

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  trigger_ai_review:
    runs-on: ubuntu-latest

    if: github.actor != 'dependabot[bot]'

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Get All Changed Files in PR
        id: changed-files
        uses: tj-actions/changed-files@v44
        with:
          files_ignore: |
            **.md
            .github/**
            package-lock.json

      - name: Prepare JSON Payload for Backend
        id: prepare_payload
        run: |
          CHANGED_FILES_STRING="${{ steps.changed-files.outputs.all_changed_files }}"
          
          if [ -z "$CHANGED_FILES_STRING" ]; then
            CHANGED_FILES_JSON="[]"
          else
            CHANGED_FILES_JSON=$(echo "$CHANGED_FILES_STRING" | jq -R . | jq -s . | jq 'map({filename: .})')
          fi
          
          PAYLOAD_BODY=$(jq -n \
            --arg repo "${{ github.repository }}" \
            --arg pr "${{ github.event.pull_request.number }}" \
            --arg sha "${{ github.event.pull_request.head.sha }}" \
            --argjson files "$CHANGED_FILES_JSON" \
            '{
              repository: $repo,
              pull_request_number: ($pr | tonumber),
              commit_sha: $sha,
              changed_files: $files
            }')

          ESCAPED=$(echo "$PAYLOAD_BODY" | jq -Rs .)
          echo "payload=$ESCAPED" >> $GITHUB_OUTPUT

      - name: Send Review Request to PR-Guardian Backend
        run: |
          SERVER_URL="https://pr-guardian.onrender.com/webhook"

          echo "Sending request to: $SERVER_URL"

          curl -X POST "$SERVER_URL" \
               -H 'Content-Type: application/json' \
               --data "${{ steps.prepare_payload.outputs.payload }}"
```

---

## 🔧 Backend Environment Variables

In your Render service:

| Variable         | Description                                                          |
| ---------------- | -------------------------------------------------------------------- |
| `GEMINI_API_KEY` | Your Gemini model API key                                            |
| `GITHUB_PAT`     | GitHub Personal Access Token with `repo` scope                       |
| `REPOS_ROOT_DIR` | Local folder for cloning repos (ex: `/opt/render/project/src/repos`) |

---

## 🛠️ Tech Stack

* **Node.js (Express)** — backend API
* **simple-git** — git clone + diff tools
* **Google Gemini (2.5-Pro)** — AI reasoning and analysis
* **GitHub REST API** — inline PR comment posting
* **GitHub Actions** — triggers and file diff extraction

---

## 📌 Features Roadmap

* [ ] Inline comments on specific lines
* [ ] Auto-fix patches (Gemini generates corrected code)
* [ ] PR risk scoring
* [ ] Multi-repo dashboard
* [ ] GitHub App version (no PAT needed)
* [ ] CI failure on severe vulnerabilities

---

## ⚠️ Disclaimer

PR-Guardian is an **automated assistant**.
Always review suggestions manually before merging changes — especially security-critical code.

---

## ⭐ Support the Project

If this project helped you:

✔️ Star ⭐ the repo
✔️ Contribute new features
✔️ Share with other developers

---
