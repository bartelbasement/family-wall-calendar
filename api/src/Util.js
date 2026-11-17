function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function prop_(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

function checkKey_(key) {
  var expected = prop_('WALL_KEY');
  if (!expected) {
    console.error('WALL_KEY is not set. Run setupWallKey() from the editor.');
    return false;
  }
  return typeof key === 'string' && key === expected;
}

/**
 * Run once from the Apps Script editor. Generates a random WALL_KEY (unless one
 * exists) and logs it. Re-run with force=true to rotate the key.
 */
function setupWallKey(force) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('WALL_KEY') && force !== true) {
    console.log('WALL_KEY already set. Call setupWallKey(true) to rotate it.');
    return;
  }
  var key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  props.setProperty('WALL_KEY', key);
  console.log('New WALL_KEY: ' + key);
}
