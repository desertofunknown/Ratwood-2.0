/obj/item/recipe_book
	icon = 'icons/roguetown/items/books.dmi'
	grid_width = 32
	grid_height = 32
	firefuel = 5 MINUTES
	var/list/types = list()
	var/mob/current_reader
	var/open
	var/base_icon_state
	var/can_spawn = TRUE
	resistance_flags = FLAMMABLE
	var/list/categories = list("All")
	var/current_category = "All"
	var/current_recipe
	var/search_query = ""
	/// Ordered metadata, built only when this book is first read.
	var/list/recipe_index

/obj/item/recipe_book/proc/generate_categories()
	categories = list("All")
	recipe_index = list()
	for(var/path as anything in types)
		if(is_abstract(path))
			for(var/sub_path as anything in sortNames(subtypesof(path)))
				if(is_abstract(sub_path))
					continue
				if(ispath(sub_path, /datum/crafting_recipe))
					var/datum/crafting_recipe/recipe = sub_path
					if(initial(recipe.hides_from_books))
						continue
				if(ispath(sub_path, /datum/anvil_recipe))
					var/datum/anvil_recipe/recipe = sub_path
					if(initial(recipe.hides_from_books))
						continue
				index_recipe(sub_path)
		else
			index_recipe(path)

/obj/item/recipe_book/proc/index_recipe(path)
	if(recipe_index[path])
		return
	var/datum/recipe = new path()
	var/recipe_name = recipe.vars["name"]
	var/category = recipe.vars["category"]
	qdel(recipe)
	if(!recipe_name)
		return
	recipe_index[path] = list("name" = recipe_name, "category" = category)
	if(category && !(category in categories))
		categories += category

/obj/item/recipe_book/dropped(mob/user, silent)
	. = ..()
	if(current_reader)
		current_reader << browse(null, "window=recipe")
		current_reader = null

/obj/item/recipe_book/attack_self(mob/user)
	. = ..()
	current_reader = user
	show_book(user)

/obj/item/recipe_book/proc/show_book(mob/user)
	if(!recipe_index)
		generate_categories()
	var/datum/browser/popup = new(user, "recipe", "", 1000, 760)
	popup.add_stylesheet("recipe_book", 'html/browser/recipe_book.css')
	var/list/font_urls = get_asset_datum(/datum/asset/simple/roguefonts).get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Keep Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Keep Pterra'; src: url('[font_urls["pterra.ttf"]]'); }</style>")
	popup.set_content(generate_html(user))
	popup.open(FALSE)

/obj/item/recipe_book/proc/generate_html(mob/user)
	var/list/html = list()
	html += "<div class='recipe-folio'><header class='recipe-header'><div class='recipe-eyebrow'>The working library</div><h1>[html_encode(name)]</h1><p>[length(recipe_index)] entries &middot; Recipes, materials, and methods</p></header><div class='recipe-pages'>"
	html += "<aside class='recipe-sidebar'><div class='recipe-tools'><label for='recipe-search'>Find an entry</label><input id='recipe-search' type='text' value='[html_encode(search_query)]' placeholder='Search recipes...' autocomplete='off'><label for='recipe-category'>Chapter</label><select id='recipe-category'>"
	for(var/category in categories)
		html += "<option value='[html_encode(category)]'[category == current_category ? " selected" : ""]>[html_encode(category)]</option>"
	html += "</select><div id='recipe-count' class='recipe-count'></div></div><nav id='recipe-list' class='recipe-list'>"
	for(var/path as anything in recipe_index)
		var/list/entry = recipe_index[path]
		html += "<a class='recipe-link[path == current_recipe ? " recipe-selected" : ""]' data-category='[html_encode(entry["category"])]' href='byond://?src=[REF(src)];action=view_recipe;recipe=[url_encode("[path]")]' onclick='return followRecipe(this)'[path == current_recipe ? " aria-current='page'" : ""]>[html_encode(entry["name"])]</a>"
	html += "<p id='recipe-empty' class='recipe-empty' style='display:none'>No entries match this chapter and search.</p></nav></aside><main class='recipe-paper'>"
	if(current_recipe && recipe_index[current_recipe])
		html += "<div class='recipe-paper-tools'><a href='byond://?src=[REF(src)];action=clear_recipe' onclick='return followRecipe(this)'>Contents</a></div><div id='recipe-detail' class='recipe-detail'></div>"
		// Existing recipe generators return standalone documents with uneven wrappers.
		// A separate DOM insertion keeps those wrappers inside the paper pane.
		html += "<textarea id='recipe-source' style='display:none'>[html_encode(generate_recipe_html(current_recipe, user))]</textarea>"
	else
		html += "<div class='recipe-welcome'><div class='recipe-ornament'>&#10022;</div><h2>Knowledge for the work ahead</h2><p>Choose an entry to read its materials and method.</p><p class='recipe-muted'>Search within a chapter, or choose All to browse the whole book.</p></div>"
	html += "</main></div></div>"
	html += {"
	<script type='text/javascript'>
	var recipeSearch = document.getElementById('recipe-search');
	var recipeCategory = document.getElementById('recipe-category');
	var recipeLinks = document.getElementById('recipe-list').getElementsByTagName('a');
	var recipeStorageKey = 'keep-recipe-[REF(src)]';
	function filterRecipes() {
		var query = recipeSearch.value.toLowerCase();
		var visible = 0;
		for(var i = 0; i < recipeLinks.length; i++) {
			var link = recipeLinks.item(i);
			var matches = (recipeCategory.value === 'All' || link.getAttribute('data-category') === recipeCategory.value) && link.textContent.toLowerCase().indexOf(query) !== -1;
			link.style.display = matches ? '' : 'none';
			if(matches) { visible++; }
		}
		document.getElementById('recipe-empty').style.display = visible ? 'none' : 'block';
		document.getElementById('recipe-count').textContent = visible + (visible === 1 ? ' entry' : ' entries');
		try { sessionStorage.setItem(recipeStorageKey, JSON.stringify({query: recipeSearch.value, category: recipeCategory.value})); } catch(e) {}
	}
	function followRecipe(link) {
		window.location.href = link.href + ';query=' + encodeURIComponent(recipeSearch.value) + ';category=' + encodeURIComponent(recipeCategory.value);
		return false;
	}
	try {
		var saved = JSON.parse(sessionStorage.getItem(recipeStorageKey) || 'null');
		if(saved) {
			recipeSearch.value = saved.query || '';
			recipeCategory.value = saved.category || 'All';
			if(!recipeCategory.value) { recipeCategory.value = 'All'; }
		}
	} catch(e) {}
	recipeSearch.oninput = filterRecipes;
	recipeCategory.onchange = filterRecipes;
	filterRecipes();
	var recipeSource = document.getElementById('recipe-source');
	if(recipeSource) {
		document.getElementById('recipe-detail').innerHTML = recipeSource.value;
		recipeSource.parentNode.removeChild(recipeSource);
	}
	var selected = document.querySelector('.recipe-selected');
	if(selected && selected.style.display !== 'none') { selected.scrollIntoView(false); }
	</script>
	"}
	return html.Join()

/obj/item/recipe_book/proc/generate_recipe_html(path, mob/user)
	if(!recipe_index[path])
		return "<p>This entry is not in this book.</p>"
	var/datum/recipe = new path()
	var/html = recipe:generate_html(user)
	qdel(recipe)
	if(!html)
		return "<p>No description is available for this entry.</p>"
	var/body_start = findtext(html, "<body>")
	var/body_end = findtext(html, "</body>")
	if(body_start && body_end > body_start)
		return copytext(html, body_start + length("<body>"), body_end)
	return html

/obj/item/recipe_book/Topic(href, href_list)
	. = ..()
	if(!usr || usr != current_reader || !usr.canUseTopic(src, BE_CLOSE))
		return
	if(!recipe_index)
		generate_categories()
	if("query" in href_list)
		search_query = href_list["query"]
	if(href_list["category"] in categories)
		current_category = href_list["category"]
	switch(href_list["action"])
		if("view_recipe")
			var/path = text2path(href_list["recipe"])
			if(!recipe_index[path])
				return
			current_recipe = path
		if("clear_recipe")
			current_recipe = null
		else
			return
	show_book(current_reader)

/obj/item/recipe_book/getonmobprop(tag)
	. = ..()
	if(tag)
		if(open)
			switch(tag)
				if("gen")
					return list("shrink" = 0.4,
	"sx" = -2,
	"sy" = -3,
	"nx" = 10,
	"ny" = -2,
	"wx" = 1,
	"wy" = -3,
	"ex" = 5,
	"ey" = -3,
	"northabove" = 0,
	"southabove" = 1,
	"eastabove" = 1,
	"westabove" = 0,
	"nturn" = 0,
	"sturn" = 0,
	"wturn" = 0,
	"eturn" = 0,
	"nflip" = 0,
	"sflip" = 0,
	"wflip" = 0,
	"eflip" = 0)
				if("onbelt")
					return list("shrink" = 0.3,"sx" = -2,"sy" = -5,"nx" = 4,"ny" = -5,"wx" = 0,"wy" = -5,"ex" = 2,"ey" = -5,"nturn" = 0,"sturn" = 0,"wturn" = 0,"eturn" = 0,"nflip" = 0,"sflip" = 0,"wflip" = 0,"eflip" = 0,"northabove" = 0,"southabove" = 1,"eastabove" = 1,"westabove" = 0)
		else
			switch(tag)
				if("gen")
					return list("shrink" = 0.4,
	"sx" = -2,
	"sy" = -3,
	"nx" = 10,
	"ny" = -2,
	"wx" = 1,
	"wy" = -3,
	"ex" = 5,
	"ey" = -3,
	"northabove" = 0,
	"southabove" = 1,
	"eastabove" = 1,
	"westabove" = 0,
	"nturn" = 0,
	"sturn" = 0,
	"wturn" = 0,
	"eturn" = 0,
	"nflip" = 0,
	"sflip" = 0,
	"wflip" = 0,
	"eflip" = 0)
				if("onbelt")
					return list("shrink" = 0.3,"sx" = -2,"sy" = -5,"nx" = 4,"ny" = -5,"wx" = 0,"wy" = -5,"ex" = 2,"ey" = -5,"nturn" = 0,"sturn" = 0,"wturn" = 0,"eturn" = 0,"nflip" = 0,"sflip" = 0,"wflip" = 0,"eflip" = 0,"northabove" = 0,"southabove" = 1,"eastabove" = 1,"westabove" = 0)
