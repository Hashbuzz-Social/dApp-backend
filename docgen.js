const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const markdownIt = require('markdown-it');

/**
 * Generate API documentation using apidoc.
 */
function generateAPIDocs() {
  const routerFolderPath = './src/routes';
  const outputFolderPath = './apidocs';

  // Clear the output folder
  fs.rmdirSync(outputFolderPath, { recursive: true });
  fs.mkdirSync(outputFolderPath);

  // Run apidoc command to generate documentation
  const command = `npx apidoc -i ${routerFolderPath} -o ${outputFolderPath}`;
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error generating API documentation: ${error}`);
      console.log(error)
      return;
    }
    console.log('API documentation generated successfully!');
  });
}

/**
 * Parse an MD file to HTML.
 *
 * @param {string} filePath - Path to the MD file.
 * @param {string} outputFilePath - Path to save the HTML file.
 */
// function parseMarkdownToHTML(filePath, outputFilePath) {
//   const md = new markdownIt();
//   const markdownContent = fs.readFileSync(filePath, 'utf-8');
//   const htmlContent = md.render(markdownContent);
//   fs.writeFileSync(outputFilePath, htmlContent);
//   console.log(`HTML file generated: ${outputFilePath}`);
// }

// Generate API documentation
generateAPIDocs();

// Parse MD file to HTML
// const mdFilePath = './input.md';
// const htmlFilePath = './output.html';
// parseMarkdownToHTML(mdFilePath, htmlFilePath);
