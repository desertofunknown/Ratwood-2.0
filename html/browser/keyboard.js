(function () {
	var spaceDown = false;

	document.addEventListener('keydown', function (event) {
		if (event.keyCode !== 32 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) {
			return;
		}

		var link = document.activeElement;
		if (!link || event.target !== link || link.tagName !== 'A' || !link.hasAttribute('href') || link.isContentEditable || link.hasAttribute('disabled') || link.getAttribute('aria-disabled') === 'true') {
			return;
		}

		event.preventDefault();
		if (spaceDown || event.repeat) {
			return;
		}
		spaceDown = true;
		link.click();
	});

	document.addEventListener('keyup', function (event) {
		if (event.keyCode === 32) {
			spaceDown = false;
		}
	});

	window.addEventListener('blur', function () {
		spaceDown = false;
	});
}());
