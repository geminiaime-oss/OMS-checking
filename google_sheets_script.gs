/**
 * GOOGLE APPS SCRIPT FOR OMS EXPORT
 * 
 * 1. Open your Google Sheet.
 * 2. Go to Extensions > Apps Script.
 * 3. Delete any existing code and paste this.
 * 4. Click 'Deploy' > 'New Deployment'.
 * 5. Select 'Web App'.
 * 6. Execute as: 'Me'.
 * 7. Who has access: 'Anyone'.
 * 8. Copy the Web App URL and paste it into app.js as GOOGLE_SHEET_WEBAPP_URL.
 */

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();
    
    // Header check
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Date', 'Order ID', 'Customer Name', 'Phone', 'Address', 'Products', 'Total', 'Advance', 'COD', 'Status', 'Updated By']);
    }

    data.rows.forEach(row => {
      sheet.appendRow([
        new Date(row.created_at).toLocaleString(),
        row.order_id,
        row.customer_name,
        row.normalized_phone,
        row.address,
        row.product_summary,
        row.total_amount,
        row.advance_amount,
        row.cod_amount,
        row.status,
        row.updated_by
      ]);
    });

    return ContentService.createTextOutput(JSON.stringify({"result": "success"}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({"result": "error", "message": err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
