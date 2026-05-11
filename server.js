const express = require("express");
const axios = require("axios");
const cors = require("cors");

const DEFAULT_PORT = 3000;
const PORT = Number(process.env.PORT || DEFAULT_PORT);
const HOST = process.env.HOST || "127.0.0.1";
const MAX_PORT_ATTEMPTS = 10;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function normalizeValue(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function isBlank(value) {
  return normalizeValue(value) === "";
}

function extractAttributes(tag) {
  const attributes = {};
  const attributePattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match = attributePattern.exec(tag);

  while (match) {
    const attributeName = String(match[1] || "").toLowerCase();
    const attributeValue = match[2] || match[3] || match[4] || "";
    attributes[attributeName] = attributeValue;
    match = attributePattern.exec(tag);
  }

  return attributes;
}

function extractTitle(html) {
  const match = String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return normalizeValue(decodeHtmlEntities(match ? match[1] : ""));
}

function extractMetaContent(html, metaName) {
  const metaTags = String(html || "").match(/<meta\b[^>]*>/gi) || [];

  for (const tag of metaTags) {
    const attributes = extractAttributes(tag);
    const currentName = String(attributes.name || "").toLowerCase();

    if (currentName === String(metaName || "").toLowerCase()) {
      return normalizeValue(decodeHtmlEntities(attributes.content || ""));
    }
  }

  return "";
}

function compareValue(label, stagingValue, liveValue) {
  const normalizedStaging = normalizeValue(stagingValue);
  const normalizedLive = normalizeValue(liveValue);

  if (isBlank(normalizedStaging) && isBlank(normalizedLive)) {
    return { status: "Same", issue: "" };
  }

  if (isBlank(normalizedLive)) {
    return {
      status: "Ignored",
      issue: normalizedStaging
        ? `${label} added in staging, missing on live (ignored)`
        : ""
    };
  }

  if (normalizedStaging === normalizedLive) {
    return { status: "Same", issue: "" };
  }

  if (isBlank(normalizedStaging)) {
    return {
      status: "Not Same",
      issue: `${label} missing in staging`
    };
  }

  return {
    status: "Not Same",
    issue: `${label} content differs`
  };
}

function buildIssueSummary(statusComparison, fieldComparisons, fetchErrors) {
  const issues = [];

  if (fetchErrors.staging) {
    issues.push(`Staging fetch error: ${fetchErrors.staging}`);
  }

  if (fetchErrors.live) {
    issues.push(`Live fetch error: ${fetchErrors.live}`);
  }

  if (statusComparison.issue) {
    issues.push(statusComparison.issue);
  }

  for (const comparison of Object.values(fieldComparisons)) {
    if (comparison.issue) {
      issues.push(comparison.issue);
    }
  }

  return issues.join("; ");
}

async function getMeta(url) {
  const trimmedUrl = normalizeValue(url);

  if (!trimmedUrl) {
    return {
      url: "",
      httpStatus: "",
      title: "",
      description: "",
      keywords: "",
      error: "URL is missing"
    };
  }

  try {
    const response = await axios.get(trimmedUrl, {
      timeout: 15000,
      validateStatus: () => true
    });
    const { data, status } = response;
    const html = typeof data === "string" ? data : "";

    return {
      url: trimmedUrl,
      httpStatus: status,
      title: extractTitle(html),
      description: extractMetaContent(html, "description"),
      keywords: extractMetaContent(html, "keywords")
    };
  } catch (err) {
    return {
      url: trimmedUrl,
      httpStatus: "",
      title: "",
      description: "",
      keywords: "",
      error: err.message || "Failed to fetch"
    };
  }
}

app.post("/compare", async (req, res) => {
  const { urls } = req.body || {};

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "Provide at least one staging/live URL pair." });
  }

  const results = [];

  for (const pair of urls) {
    const stagingMeta = await getMeta(pair.staging);
    const liveMeta = await getMeta(pair.live);
    
    // Check if target keywords are provided in the input
    const targetKeywords = (pair.keywords || "").trim().toLowerCase();
    
    const statusComparison =
      String(stagingMeta.httpStatus) === String(liveMeta.httpStatus)
        ? { status: "Same", issue: "" }
        : { status: "Not Same", issue: "HTTP status differs" };

    const fieldComparisons = {
      title: compareValue("Title", stagingMeta.title, liveMeta.title),
      description: compareValue("Description", stagingMeta.description, liveMeta.description),
      keywords: compareValue("Keywords", stagingMeta.keywords, liveMeta.keywords)
    };

    // If target keywords are provided, also check if they exist on the pages
    if (targetKeywords) {
      const stagingHasKeyword = stagingMeta.keywords.toLowerCase().includes(targetKeywords);
      const liveHasKeyword = liveMeta.keywords.toLowerCase().includes(targetKeywords);
      
      if (!stagingHasKeyword) {
        fieldComparisons.keywords.status = "Not Same";
        fieldComparisons.keywords.issue = 
          (fieldComparisons.keywords.issue ? fieldComparisons.keywords.issue + "; " : "") + 
          `Target keyword "${targetKeywords}" missing on staging`;
      }
      
      if (!liveHasKeyword) {
        fieldComparisons.keywords.status = "Not Same";
        fieldComparisons.keywords.issue = 
          (fieldComparisons.keywords.issue ? fieldComparisons.keywords.issue + "; " : "") + 
          `Target keyword "${targetKeywords}" missing on live`;
      }
    }

    const blockingMismatch =
      statusComparison.status === "Not Same" ||
      Object.values(fieldComparisons).some((comparison) => comparison.status === "Not Same");

    const hasFetchError = Boolean(stagingMeta.error || liveMeta.error);

    const overallStatus = hasFetchError
      ? "Error"
      : blockingMismatch
        ? "Not Same"
        : "Same";

    const issues = buildIssueSummary(
      statusComparison,
      fieldComparisons,
      { staging: stagingMeta.error, live: liveMeta.error }
    );

    results.push({
      liveUrl: liveMeta.url || normalizeValue(pair.live),
      stagingUrl: stagingMeta.url || normalizeValue(pair.staging),
      targetKeywords: pair.keywords || "",
      result: overallStatus,
      status: statusComparison.status,
      titleStatus: fieldComparisons.title.status,
      descriptionStatus: fieldComparisons.description.status,
      keywordsStatus: fieldComparisons.keywords.status,
      issues,
      liveHttpStatus: liveMeta.httpStatus,
      stagingHttpStatus: stagingMeta.httpStatus,
      stagingMeta,
      liveMeta
    });
  }

  res.json(results);
});

app.post("/fetch-sheet", async (req, res) => {
  const { url } = req.body || {};
  let match = String(url || "").match(/\/d\/(.*?)\//);
  const id = match ? match[1] : String(url || "").trim();
  
  if (!id) {
    return res.status(400).json({ error: "Invalid Google Sheet URL or ID." });
  }

  try {
    const response = await axios.get(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv`, { 
      responseType: 'text',
      timeout: 10000 
    });
    res.send(response.data);
  } catch (error) {
    res.status(500).json({ error: "Could not fetch Google Sheet. Please ensure the sheet is accessible by 'Anyone with the link'." });
  }
});

function startServer(port, attempt) {
  const server = app.listen(port, HOST);

  server.once("listening", () => {
    console.log(`Server running on http://${HOST}:${port}`);
  });

  server.once("error", (error) => {
    const shouldRetry =
      error.code === "EADDRINUSE" &&
      !process.env.PORT &&
      attempt < MAX_PORT_ATTEMPTS;

    if (shouldRetry) {
      const nextPort = port + 1;
      console.log(`Port ${port} is busy, trying http://${HOST}:${nextPort} instead...`);
      startServer(nextPort, attempt + 1);
      return;
    }

    throw error;
  });
}

startServer(PORT, 0);
