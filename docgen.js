const fs = require('fs');
const jsdoc2md = require('jsdoc-to-markdown');
const path = require('path');

const srcFolderPath = './src/routes';
const outputFolderPath = './apidocs';

// Create the output folder if it doesn't exist
if (!fs.existsSync(outputFolderPath)) {
  fs.mkdirSync(outputFolderPath);
}

const files =  fs.readdirSync(srcFolderPath)
console.log(files)
// Read all files in the source folder
files.forEach(file => {
  const filePath = path.join(srcFolderPath, file);

  // Process JavaScript files only
  if (path.extname(file) === '.ts') {
    // Generate the MD content using jsdoc-to-markdown
    const mdContent = jsdoc2md.renderSync({ files: filePath });

    // Generate the output file path
    const outputFilePath = path.join(outputFolderPath, `${path.basename(file, '.ts')}.md`);

    // Write the MD content to the output file
    fs.writeFileSync(outputFilePath, mdContent);

    console.log(`Generated MD file: ${outputFilePath}`);
  }
});
