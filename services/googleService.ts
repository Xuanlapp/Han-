// services/googleService.ts

/**
 * Uploads a file (Blob/File) to Google Drive and makes it public (anyone with link).
 */
export const uploadImageToDrive = async (
  accessToken: string, 
  file: Blob, 
  filename: string
): Promise<string> => {
  // 1. Upload File (Multipart)
  const metadata = {
    name: filename,
    mimeType: 'image/png'
  };
  
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    body: form
  });
  
  if (!res.ok) {
      const err = await res.json();
      throw new Error(`Drive Upload Failed: ${err.error?.message || res.statusText}`);
  }
  
  const json = await res.json();
  const fileId = json.id;
  const webViewLink = json.webViewLink;

  // 2. Set Permission to 'Anyone with link' (Viewer)
  // This ensures the link works in the spreadsheet without login
  const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
     method: 'POST',
     headers: { 
       'Authorization': `Bearer ${accessToken}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });

  if (!permRes.ok) {
      console.warn("Failed to set public permission on file", fileId);
  }

  return webViewLink;
};

/**
 * Fetches the specific Sheet Name (tab name) using the Spreadsheet ID and GID.
 */
export const fetchSheetNameByGid = async (accessToken: string, spreadsheetId: string, gid: string): Promise<string> => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`;
  const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!res.ok) {
      const err = await res.json();
      throw new Error(`Failed to fetch sheet metadata: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  
  // Find the sheet that matches the GID (Sheet ID)
  // gid is usually a number string in the URL (e.g. gid=0 or gid=12345)
  const sheet = data.sheets?.find((s: any) => s.properties.sheetId.toString() === gid.toString());
  
  if (!sheet) {
      // If specific GID not found, return the name of the first sheet as fallback
      console.warn(`GID ${gid} not found, defaulting to first sheet.`);
      return data.sheets?.[0]?.properties?.title || "Sheet1";
  }

  return sheet.properties.title;
};

/**
 * Appends a row to a Google Sheet.
 */
export const appendToSheet = async (
    accessToken: string, 
    spreadsheetId: string, 
    sheetName: string,
    rowData: string[]
) => {
  // Handle sheet names with spaces by wrapping in single quotes if not already there
  let formattedSheetName = sheetName || "Sheet1";
  if (formattedSheetName.includes(' ') && !formattedSheetName.startsWith("'")) {
      formattedSheetName = `'${formattedSheetName}'`;
  }

  // Construct range: SheetName!A1 (Append looks for next available row in this table)
  const range = `${formattedSheetName}!A1`;
  
  // IMPORTANT: 
  // 1. :append method automatically finds the last row of the table.
  // 2. insertDataOption=INSERT_ROWS forces insertion of new rows to prevent any potential overwriting of data below the table.
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: [rowData] })
  });
  
  if (!res.ok) {
      const err = await res.json();
      throw new Error(`Sheet Update Failed: ${err.error?.message || res.statusText}`);
  }

  return await res.json();
};

// Helper to handle the full sync process for a panel
export const syncPanelToGoogle = async (
    accessToken: string,
    spreadsheetId: string,
    sheetName: string,
    originalFile: File,
    originalName: string,
    generatedImages: { blob: Blob, name: string }[],
    status: string,
    keyword: string
) => {
    // 1. Upload Original
    const originalLink = await uploadImageToDrive(accessToken, originalFile, originalName);

    // 2. Upload Generated Images
    const generatedLinks: string[] = [];
    for (const img of generatedImages) {
        const link = await uploadImageToDrive(accessToken, img.blob, img.name);
        generatedLinks.push(link);
    }

    // 3. Prepare Row: [Keyword, Status, Original, Img 1, ..., Img 20]
    // Column 1: Keyword
    // Column 2: Status
    // Column 3: Original Image Link
    // Column 4+: Generated Images
    const row = [keyword, status, originalLink];
    
    // Fill remaining columns with generated image links
    for(let i = 0; i < generatedLinks.length; i++) {
        row.push(generatedLinks[i]);
    }

    await appendToSheet(accessToken, spreadsheetId, sheetName, row);
};