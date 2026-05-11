# Meta Tag Comparison Tool

A powerful web-based utility to compare SEO meta tags between two different environments (e.g., Staging vs. Live). This tool helps ensure that SEO metadata is correctly deployed and identifies discrepancies quickly.

## 🚀 Features

- **CSV Upload Support**: Easily upload large lists of URL pairs for bulk comparison.
- **Comprehensive Comparison**: Checks and compares:
  - HTTP Status Codes
  - Page Titles
  - Meta Descriptions
  - Meta Keywords
- **Smart Validation**: Empty values on the live page are intelligently marked as "ignored" to prevent unnecessary failure reports.
- **Export Capabilities**: Download the detailed comparison results as a CSV for further analysis.
- **Real-time Feedback**: View progress and results directly in a clean, modern web interface.

## 🛠️ Tech Stack

- **Backend**: Node.js, Express
- **Scraping**: Axios, Cheerio
- **Frontend**: HTML5, Vanilla JavaScript, CSS3

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher recommended)
- npm (comes with Node.js)

## ⚙️ Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd Meta-tag-comparison-tools
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## 🚀 Usage

1. Start the server:
   ```bash
   npm start
   ```

2. Open your browser and navigate to `http://localhost:3000` (or the port specified in your console).

3. Prepare a CSV file with the following column headers:
   - `Staging URL`
   - `Live URL`
   - `Keyword` (Optional)

4. Upload the CSV and wait for the comparison to complete.

5. Review the results on screen and click **Export CSV** to save the report.

## 📄 License

This project is open-source and free to use.
