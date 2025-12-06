// services/llmService.js - Section 1: JSON Schema Definition

const { GoogleGenAI, Type } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Schema for a single finding
const FINDING_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { 
      type: Type.STRING, 
      description: 'A concise, actionable title for the vulnerability or issue (e.g., "SQL Injection Vulnerability").' 
    },
    type: { 
      type: Type.STRING, 
      enum: ['Security', 'Quality', 'Best Practice', 'Architecture'], 
      description: 'The category of the finding.' 
    },
    severity: { 
      type: Type.STRING, 
      enum: ['Critical', 'High', 'Medium', 'Low', 'Note'], 
      description: 'The severity level.' 
    },
    location: { 
      type: Type.STRING, 
      description: 'The file path and line number where the issue occurs, e.g., "src/data_handler.js:45".' 
    },
    description: { 
      type: Type.STRING, 
      description: 'A detailed, technical explanation of the issue, why it is dangerous, and its impact.' 
    },
    fixRecommendation: { 
      type: Type.STRING, 
      description: 'A step-by-step or example code fix for remediation.' 
    },
    exploitExample: {
        type: Type.STRING,
        description: 'Optional: A short, illustrative example of how the issue could be exploited (if security related). If not applicable, use "N/A".'
    }
  },
  required: ['title', 'type', 'severity', 'location', 'description', 'fixRecommendation']
};

// Top-level schema for the entire response
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    findings: {
      type: Type.ARRAY,
      items: FINDING_SCHEMA,
      description: 'A list of all security and quality findings detected in the code changes.'
    }
  }
};

// services/llmService.js - Section 2: LLM Service Function

// Converts the structured JSON output into Markdown for GitHub (Step 6)
function jsonToMarkdown(findings) {
    if (!findings || findings.length === 0) {
        return "### ✅ No Significant Issues Detected\n\n_The code changes appear clean based on AI review._";
    }

    let markdown = "### 🚨 Review Findings\n\n";

    for (const [index, finding] of findings.entries()) {
        markdown += `---
#### ${index + 1}. ${finding.title}
* **Type:** \`${finding.type}\`
* **Severity:** **<span style="color:${getSeverityColor(finding.severity)};">${finding.severity}</span>**
* **Location:** \`${finding.location}\`
* **Description:** ${finding.description.trim()}
* **Fix Recommendation:** ${finding.fixRecommendation.trim()}
${finding.exploitExample && finding.exploitExample !== 'N/A' ? `* **Exploit Example:** \n\`\`\`\n${finding.exploitExample.trim()}\n\`\`\`` : ''}
`;
    }
    return markdown;
}

function getSeverityColor(severity) {
    switch (severity.toLowerCase()) {
        case 'critical': return 'red';
        case 'high': return 'orange';
        case 'medium': return 'darkorange';
        case 'low': return 'gold';
        default: return 'gray';
    }
}

async function getAIReview(filesToReview, repository, prNumber) {
    // 1. Construct the context prompt (using diffs from githubService.js)
    const diffContext = filesToReview.map(file => {
        return `
<file_diff>
    <filename>${file.filename}</filename>
    <content_diff>
${file.diffContent}
    </content_diff>
</file_diff>
`;
    }).join('\n');

    // 2. Define the System Instruction (The Persona, The Rules)
    const systemInstruction = `
You are an expert, highly critical code security and quality auditor named "Gemini AI Reviewer".
Your sole task is to analyze the provided code diffs and strictly identify issues, vulnerabilities, and deviations from best practices.
NEVER compliment the code or output any prose outside of the descriptions and recommendations.
Your output MUST strictly adhere to the provided JSON schema. If no issues are found, return an empty array for 'findings'.
Focus on:
1. Security Vulnerabilities (e.g., XSS, SQLi, insecure deserialization).
2. Code Quality (e.g., excessive complexity, lack of error handling).
3. Best Practices (e.g., lack of strong typing, confusing logic).
4. Architecture (e.g., poor component separation).
`;

    // 3. Define the User Prompt (The Task, The Context)
    const userPrompt = `
**TASK:** Review the following code changes from Pull Request #${prNumber} in repository ${repository}.
**CONTEXT:** The changes are provided as Git diffs. Analyze the changes deeply and populate the JSON schema with your findings.
**CODE CHANGES TO REVIEW:**

${diffContext}
`;
    
    // 4. Call the Gemini API with Structured Output configuration
    console.log("Sending structured review request to Gemini...");
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro", // Best model for complex reasoning and code
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.2, // Lower temp for more deterministic, analytical output
                responseMimeType: "application/json",
                responseSchema: RESPONSE_SCHEMA
            }
        });

        // 5. Parse the JSON response (it's guaranteed to be JSON)
        const jsonText = response.text.trim();
        const reviewJson = JSON.parse(jsonText);
        
        // 6. Convert the structured JSON findings into clean Markdown
        return jsonToMarkdown(reviewJson.findings);

    } catch (error) {
        console.error("Gemini API call failed:", error);
        return `### ❌ AI Review Failed\n\nAn error occurred while running the AI audit:\n\`\`\`\n${error.message}\n\`\`\`\nPlease check the server logs.`;
    }
}

module.exports = {
    getAIReview
};