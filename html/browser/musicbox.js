document.addEventListener('DOMContentLoaded', function () {
	var panel = document.querySelector('.musicbox');
	var search = document.getElementById('music-search');
	var catalogue = document.getElementById('music-catalogue');
	var key = 'keep-musicbox-' + panel.getAttribute('data-device');
	function filterSongs() {
		var query = search.value.toLowerCase().trim();
		var groups = catalogue.querySelectorAll('.musicbox-collection');
		var total = 0;
		for (var i = 0; i < groups.length; i++) {
			var group = groups.item(i);
			var songs = group.querySelectorAll('.musicbox-song');
			var matches = 0;
			for (var j = 0; j < songs.length; j++) {
				var song = songs.item(j);
				var name = song.querySelector('span').textContent;
				var visible = (name + ' ' + group.getAttribute('data-collection')).toLowerCase().indexOf(query) !== -1;
				song.style.display = visible ? '' : 'none';
				if (visible) matches++;
			}
			group.style.display = matches ? '' : 'none';
			total += matches;
		}
		document.getElementById('music-no-matches').hidden = total > 0;
		try { sessionStorage.setItem(key + '-search', search.value); } catch (error) {}
	}
	search.addEventListener('input', filterSongs);
	catalogue.addEventListener('scroll', function () {
		try { sessionStorage.setItem(key + '-scroll', catalogue.scrollTop); } catch (error) {}
	});
	document.addEventListener('focusin', function (event) {
		try { sessionStorage.setItem(key + '-focus', event.target.id || ''); } catch (error) {}
	});
	try { search.value = sessionStorage.getItem(key + '-search') || ''; } catch (error) {}
	filterSongs();
	try {
		catalogue.scrollTop = Number(sessionStorage.getItem(key + '-scroll')) || 0;
		var focused = document.getElementById(sessionStorage.getItem(key + '-focus'));
		if (document.hasFocus() && focused && focused.offsetHeight) focused.focus();
	} catch (error) {}
});
