-- The workbench's state, view, events, keyed reconciliation and focus policy
-- execute in the Lua VM. The host provides only the shared catalog model,
-- delivered data, callback, mount node and unique ID. No game bridge is loaded.
local js = require "js"
-- All source is bundled. Disable Lua's package file/network searchers; this is
-- not a security sandbox (interop deliberately has DOM access).
package.searchers = {}

return function(_, host)
  local document = host.target.ownerDocument
  local data = host.data
  local query, category, limit, selectedIdentity = "", nil, host.pageSize, nil
  local selected, filtered, onlyMatches = nil, nil, false
  local rowRecords, staticListeners, detailListeners = {}, {}, {}
  local detail, detailIdentity = nil, nil
  local listScroll, closed = 0, false
  local render

  local function text(node, value)
    value = js.global:String(value)
    if node.textContent ~= value then node.textContent = value end
  end
  local function attr(node, key, value)
    if value == nil then
      if node:hasAttribute(key) then node:removeAttribute(key) end
    else
      value = tostring(value)
      if node:getAttribute(key) ~= value then node:setAttribute(key, value) end
    end
  end
  local function element(tag, class, content, parent)
    local node = document:createElement(tag)
    if class then node.className = class end
    if content then text(node, content) end
    if parent then parent:appendChild(node) end
    return node
  end
  local function button(class, content, parent)
    local node = element("button", class, content, parent)
    node.type = "button"
    return node
  end
  local function listen(node, kind, callback, listeners)
    -- Host retains exact JS listener identity. Each returned disposer is a JS
    -- function userdata, not a Lua function converted to a new proxy each time.
    table.insert(listeners or staticListeners, host:listen(node, kind, callback))
  end
  local function dispose(listeners)
    for _, listener in ipairs(listeners) do
      listener()
    end
    for i = #listeners, 1, -1 do listeners[i] = nil end
  end
  local function payload()
    return js.new(js.global.Object)
  end
  local function focus(node, preventScroll)
    local options = payload()
    options.preventScroll = preventScroll or false
    node:focus(options)
  end
  -- The contract permits booleans and numbers. Lua considers 0 truthy; JS does
  -- not. Convert explicitly, rather than using Lua `not data.showonlycraftable`.
  local function materialFilter(value)
    return value == true or (type(value) == "number" and value ~= 0 and value == value)
  end
  local function orText(value, fallback)
    if value == nil or value == js.null or value == "" then return fallback end
    return value
  end
  local function nullish(value, fallback)
    if value == nil or value == js.null then return fallback end
    return value
  end
  local function matchText(entry)
    return "Material match: " .. (entry.materialMatch and "reported" or "not reported")
  end
  local function emitFilter(state)
    local value = payload()
    value.state = state
    host:action("checkboxonlycraftable", value)
  end

  local root = element("section", "Workbench", nil, host.target)
  attr(root, "aria-label", "Crafting workbench")
  local header = element("header", "Workbench__header", nil, root)
  element("p", "Workbench__eyebrow", "Workshop ledger", header)
  element("h1", nil, "The workbench", header)
  element("p", "Workbench__intro", "Choose a recipe. Review its requirements.", header)
  local filters = element("div", "Workbench__filters", nil, root)
  local label = element("label", "Workbench__label", "Find a recipe", filters)
  attr(label, "for", host.id .. "-search")
  local searchBox = element("div", "Workbench__search", nil, filters)
  local search = element("input", nil, nil, searchBox)
  search.id, search.type = host.id .. "-search", "search"
  attr(search, "aria-label", "Search recipes by name or ingredients")
  search.placeholder = "Name or ingredients…"
  local clear = button(nil, "Clear", searchBox)
  local filterRow = element("div", "Workbench__filter-row", nil, filters)
  local categoryLabel = element("label", "Workbench__category", nil, filterRow)
  element("span", "Workbench__label", "Category", categoryLabel)
  local select = element("select", nil, nil, categoryLabel)
  local all = element("option", nil, "All categories", select)
  all.value = ""
  local categoryOptions = {}
  local checkLabel = element("label", "Workbench__check", nil, filterRow)
  local checkbox = element("input", nil, nil, checkLabel)
  checkbox.type = "checkbox"
  element("span", nil, "Material matches only", checkLabel)
  local content = element("div", "Workbench__content", nil, root)
  local list = element("div", "Workbench__list", nil, content)
  attr(list, "aria-label", "Recipe catalog")
  local listHeading = element("div", "Workbench__list-heading", nil, list)
  attr(listHeading, "role", "status")
  attr(listHeading, "aria-live", "polite")
  local countText = element("span", nil, nil, listHeading)
  local shownText = element("span", nil, nil, listHeading)
  local recipes, empty, more
  local folio = element("section", "Workbench__folio", nil, content)
  folio.id = host.id .. "-folio"

  local function clearQuery()
    query, limit = "", host.pageSize
    render()
    focus(search)
  end
  listen(search, "input", function()
    query, limit = search.value, host.pageSize
    render()
  end)
  listen(clear, "click", clearQuery)
  listen(select, "change", function()
    category = select.value ~= "" and string.sub(select.value, 10) or nil
    limit = host.pageSize
    render()
  end)
  listen(checkbox, "change", function()
    checkbox.checked = onlyMatches
    emitFilter(not onlyMatches)
  end)

  local function craft(amount, auto)
    if closed or not selected then return end
    local value = payload()
    value.item = selected.recipe.path
    if amount then value.amount = amount end
    if auto then value.auto = true end
    host:action("craft", value)
  end
  local function back()
    local identity = selectedIdentity
    for i = 0, filtered.length - 1 do
      if filtered[i].identity == identity and i >= limit then
        limit = math.ceil((i + 1) / host.pageSize) * host.pageSize
      end
    end
    selectedIdentity = nil
    render()
    local row = rowRecords[identity]
    local target = row and row.button or search
    focus(target, true)
    list.scrollTop = listScroll
    -- Preserve the inner position where possible, but reveal focus in outer scrollers too.
    local options = payload()
    options.block, options.inline, options.behavior = "nearest", "nearest", "instant"
    target:scrollIntoView(options)
  end
  local function createDetail()
    local backButton = button("Workbench__back", "← Back to recipes", folio)
    listen(backButton, "click", back, detailListeners)
    local record = {}
    record.category = element("p", "Workbench__eyebrow", nil, folio)
    record.heading = element("h2", "Workbench__folio-title", nil, folio)
    record.heading.id = host.id .. "-recipe"
    record.heading.tabIndex = -1
    record.match = element("p", "Workbench__folio-match", nil, folio)
    record.requirements = element("dl", "Workbench__requirements", nil, folio)
    record.fields = {}
    element("p", "Workbench__advisory", "Material match is advisory, not readiness. Same-name recipes share this check; variants may differ. Crafting still checks the recipe’s requirements.", folio)
    local actions = element("div", "Workbench__actions", nil, folio)
    attr(actions, "aria-label", "Craft selected recipe")
    for _, amount in ipairs({ 1, 2, 3, 5, 0 }) do
      local class = amount == 1 and "Workbench__craft-primary" or (amount == 0 and "Workbench__repeat" or nil)
      local action = button(class, amount == 0 and "Repeat" or "Craft " .. amount, actions)
      listen(action, "click", function()
        craft(amount ~= 0 and amount ~= 1 and amount or nil, amount == 0)
      end, detailListeners)
      listen(action, "keydown", function(_, event)
        if event["repeat"] and (event.key == "Enter" or event.key == " ") then event:preventDefault() end
      end, detailListeners)
    end
    return record
  end
  local function updateDetail()
    text(detail.category, selected.category)
    text(detail.heading, selected.recipe.name)
    text(detail.match, matchText(selected))
    attr(detail.match, "class", "Workbench__folio-match " .. (selected.materialMatch and "Workbench__match--yes" or ""))
    local recipe = selected.recipe
    local fieldValues = {
      { "Ingredients", orText(recipe.req_text, "Not listed") },
      { "Tool", orText(recipe.tool_text, false) },
      { "Catalyst", orText(recipe.catalyst_text, false) },
      { "Difficulty", nullish(recipe.craftingdifficulty, "Not listed") },
      { "Sell price", nullish(recipe.sellprice, "Not listed") },
    }
    local position = 0
    for _, field in ipairs(fieldValues) do
      local name, value = field[1], field[2]
      local record = detail.fields[name]
      if value ~= false then
        if not record then
          record = { node = element("div") }
          element("dt", nil, name, record.node)
          record.value = element("dd", nil, nil, record.node)
          detail.fields[name] = record
        end
        text(record.value, value)
        local before = detail.requirements.children[position]
        if before ~= record.node then detail.requirements:insertBefore(record.node, before or js.null) end
        position = position + 1
      elseif record then
        record.node:remove()
        detail.fields[name] = nil
      end
    end
  end
  local function placeholder()
    local node = element("div", "Workbench__folio-placeholder", nil, folio)
    local ornament = element("span", "Workbench__ornament", "◇", node)
    attr(ornament, "aria-hidden", "true")
    element("h2", nil, "A recipe awaits", node)
    element("p", nil, "Choose a recipe from the ledger to read its requirements and craft.", node)
  end
  placeholder()

  local function newRow(entry)
    local record = { node = element("li"), listeners = {} }
    record.button = button("Workbench__recipe", nil, record.node)
    attr(record.button, "aria-controls", host.id .. "-folio")
    record.name = element("span", "Workbench__recipe-name", nil, record.button)
    record.ingredients = element("span", "Workbench__recipe-ingredients", nil, record.button)
    record.match = element("span", "Workbench__match", nil, record.button)
    listen(record.button, "click", function()
      if closed then return end
      listScroll, selectedIdentity = list.scrollTop, record.entry.identity
      render()
    end, record.listeners)
    return record
  end

  render = function()
    if closed then return end
    -- Recompute from every delivery, including records mutated in place.
    local entries, categories = host:getRecipeEntries(data), host:categories(data)
    local foundCategory, keepOptions = false, {}
    for i = 0, categories.length - 1 do
      local name = categories[i]
      if category == name then foundCategory = true end
      local option = categoryOptions[name]
      if not option then
        option = element("option", nil, name)
        option.value = "category:" .. name
        categoryOptions[name] = option
      end
      keepOptions[name] = true
      if select.children[i + 1] ~= option then select:insertBefore(option, select.children[i + 1] or js.null) end
    end
    for name, option in pairs(categoryOptions) do
      if not keepOptions[name] then option:remove(); categoryOptions[name] = nil end
    end
    if category and not foundCategory then category, limit = nil, host.pageSize end
    local nextOnly = materialFilter(data.showonlycraftable)
    if nextOnly ~= onlyMatches then limit = host.pageSize end
    onlyMatches = nextOnly
    filtered = host:filterRecipeEntries(entries, query, category or js.null, onlyMatches)
    selected = nil
    if selectedIdentity ~= nil then
      for i = 0, filtered.length - 1 do
        if filtered[i].identity == selectedIdentity then selected = filtered[i]; break end
      end
    end
    local removedSelection = selectedIdentity ~= nil and selected == nil
    if removedSelection then selectedIdentity = nil end
    local visibleCount = math.min(limit, filtered.length)
    attr(root, "data-open", selected ~= nil)
    if search.value ~= query then search.value = query end
    clear.disabled = query == ""
    select.value = category and "category:" .. category or ""
    checkbox.checked = onlyMatches
    text(countText, math.tointeger(filtered.length) .. (filtered.length == 1 and " recipe matched" or " recipes matched"))
    text(shownText, math.tointeger(visibleCount) .. " shown")

    if visibleCount == 0 then
      if recipes then recipes:remove(); recipes = nil end
      if not empty then
        empty = element("div", "Workbench__empty", nil, list)
        element("h2", nil, "No recipes found", empty)
        element("p", nil, "Try another name or ingredient, or reset the filters.", empty)
        local reset = button(nil, "Reset filters", empty)
        -- The empty node is reused, so this static listener is registered once.
        listen(reset, "click", function()
          query, category, limit = "", nil, host.pageSize
          local requestReset = onlyMatches
          render()
          if requestReset then emitFilter(false) end
          focus(search)
        end)
      elseif empty.parentNode ~= list then list:appendChild(empty) end
    else
      if empty then empty:remove() end
      if not recipes then recipes = element("ol", "Workbench__recipes", nil, list) end
    end
    local keepRows = {}
    for i = 0, visibleCount - 1 do
      local entry = filtered[i]
      local record = rowRecords[entry.identity]
      if not record then record = newRow(entry); rowRecords[entry.identity] = record end
      record.entry, keepRows[entry.identity] = entry, true
      if i == 0 or filtered[i - 1].category ~= entry.category then
        if not record.category then
          record.category = element("h2", "Workbench__category-heading")
          record.node:insertBefore(record.category, record.button)
        end
        text(record.category, entry.category)
      elseif record.category then record.category:remove(); record.category = nil end
      -- These nodes are renderer-owned; unchanged primitives do not repair external DOM edits.
      local name = entry.recipe.name
      if type(name) ~= "string" or record.lastName ~= name then
        text(record.name, name)
        record.lastName = type(name) == "string" and name or nil
      end
      local ingredients = orText(entry.recipe.req_text, "Ingredients not listed")
      if type(ingredients) ~= "string" or record.lastIngredients ~= ingredients then
        text(record.ingredients, ingredients)
        record.lastIngredients = type(ingredients) == "string" and ingredients or nil
      end
      local materialMatch = entry.materialMatch
      if record.lastMaterialMatch ~= materialMatch then
        text(record.match, matchText(entry))
        attr(record.match, "class", "Workbench__match " .. (materialMatch and "Workbench__match--yes" or ""))
        record.lastMaterialMatch = materialMatch
      end
      local expanded = entry.identity == selectedIdentity and selected ~= nil
      if record.lastExpanded ~= expanded then
        attr(record.button, "aria-expanded", expanded)
        record.lastExpanded = expanded
      end
      if recipes.children[i] ~= record.node then recipes:insertBefore(record.node, recipes.children[i] or js.null) end
    end
    for identity, record in pairs(rowRecords) do
      if not keepRows[identity] then
        dispose(record.listeners)
        record.node:remove()
        rowRecords[identity] = nil
      end
    end
    if visibleCount < filtered.length then
      if not more then
        more = button("Workbench__more")
        listen(more, "click", function()
          local nextEntry = filtered[limit]
          limit = limit + host.pageSize
          render()
          if nextEntry and rowRecords[nextEntry.identity] then focus(rowRecords[nextEntry.identity].button) end
        end)
      end
      text(more, "Show " .. math.tointeger(math.min(host.pageSize, filtered.length - visibleCount)) .. " more recipes")
      if list.lastElementChild ~= more then list:appendChild(more) end
    elseif more then more:remove() end

    local changedDetail = detailIdentity ~= selectedIdentity
    if changedDetail then
      dispose(detailListeners)
      folio:replaceChildren()
      detail, detailIdentity = nil, selectedIdentity
      if selected then detail = createDetail() else placeholder() end
    end
    attr(folio, "aria-label", selected == nil and "Recipe details" or nil)
    attr(folio, "aria-labelledby", selected and host.id .. "-recipe" or nil)
    if selected then
      updateDetail()
      if changedDetail then focus(detail.heading, true); folio.scrollTop = 0 end
    elseif removedSelection and document.activeElement == document.body then
      focus(search)
    end
  end

  render()
  return {
    update = function(_, nextData)
      data = nextData
      render()
    end,
    unmount = function()
      closed = true
      dispose(staticListeners)
      dispose(detailListeners)
      for _, record in pairs(rowRecords) do dispose(record.listeners) end
      rowRecords, selected, filtered, data, detail = {}, nil, nil, nil, nil
      root:remove()
    end,
  }
end
