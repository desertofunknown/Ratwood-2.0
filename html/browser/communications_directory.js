function filterCommsDirectory(value) {
	var query = value.toLowerCase().replace(/^\s+|\s+$/g, '');
	var rows = document.getElementById('directory-entries').getElementsByTagName('tr');
	var visible = 0;
	for (var i = 0; i < rows.length; i++) {
		var row = rows.item(i);
		if (typeof row.directorySearchText === 'undefined') {
			row.directorySearchText = (row.textContent || row.innerText || '').toLowerCase();
		}
		var matches = row.directorySearchText.indexOf(query) !== -1;
		row.style.display = matches ? '' : 'none';
		if (matches) visible++;
	}
	document.getElementById('directory-no-matches').style.display = visible ? 'none' : 'block';
}
