#define AUDIO_UPLOAD_MAX_BYTES 6485760
#define AUDIO_UPLOAD_ACCOUNT_COUNT 8
#define AUDIO_UPLOAD_GLOBAL_COUNT 64
#define AUDIO_UPLOAD_ACCOUNT_KIB (32 * 1024)
#define AUDIO_UPLOAD_GLOBAL_KIB (256 * 1024)

GLOBAL_DATUM_INIT(audio_uploads, /datum/audio_upload_budget, new)

/// Counts transmitted resources for the whole round, including rejected songs.
/datum/audio_upload_budget
	var/list/account_count = list()
	var/list/account_kib = list()
	var/list/account_next_upload = list()
	var/list/pending = list()
	var/upload_count = 0
	var/upload_kib = 0
	var/next_prompt = 0
	var/next_transfer = 0
	var/staging_failed = FALSE

/datum/audio_upload_request
	var/client/uploader
	var/mob/user
	var/account
	var/reserved_kib = 0
	var/received_bytes = 0
	var/finished = FALSE

/datum/audio_upload_budget/proc/begin(mob/user)
	if(QDELETED(user) || !user.client || !user.ckey)
		return
	for(var/pending_account in pending.Copy())
		var/datum/audio_upload_request/disconnected_request = pending[pending_account]
		if(!disconnected_request.uploader)
			finish(disconnected_request)
	var/account = user.ckey
	if(pending[account])
		to_chat(user, span_warning("Finish your current song upload first."))
		return
	if(staging_failed)
		to_chat(user, span_warning("Song uploads are unavailable this round."))
		return
	if(world.time < next_prompt || world.time < account_next_upload[account])
		to_chat(user, span_warning("Please wait before uploading another song."))
		return
	var/reservation = CEILING(AUDIO_UPLOAD_MAX_BYTES / 1024, 1)
	if(account_count[account] >= AUDIO_UPLOAD_ACCOUNT_COUNT || account_kib[account] + reservation > AUDIO_UPLOAD_ACCOUNT_KIB)
		to_chat(user, span_warning("You have reached your song upload allowance for this round."))
		return
	if(upload_count >= AUDIO_UPLOAD_GLOBAL_COUNT || upload_kib + reservation > AUDIO_UPLOAD_GLOBAL_KIB)
		to_chat(user, span_warning("The round's song upload allowance is full. Existing songs can still be played."))
		return
	var/datum/audio_upload_request/request = new
	request.uploader = user.client
	request.user = user
	request.account = account
	request.reserved_kib = reservation
	pending[account] = request
	account_count[account]++
	account_kib[account] += reservation
	upload_count++
	upload_kib += reservation
	account_next_upload[account] = world.time + 3 MINUTES
	next_prompt = world.time + 30 SECONDS
	return request

/// AllowUpload runs before BYOND receives the file into its resource cache.
/client/AllowUpload(filename, filelength)
	var/datum/audio_upload_request/request = GLOB.audio_uploads.pending[ckey]
	if(!request || request.uploader != src)
		return ..()
	if(GLOB.audio_uploads.staging_failed || request.finished || request.received_bytes || mob != request.user || world.time < GLOB.audio_uploads.next_transfer)
		to_chat(src, span_warning("This song upload is no longer available. Please try again later."))
		return FALSE
	if(LOWER_TEXT(copytext(filename, -4)) != ".ogg" || !isnum(filelength) || filelength <= 0 || filelength > AUDIO_UPLOAD_MAX_BYTES)
		to_chat(src, span_warning("Choose a nonempty OGG song of 6 MB or less."))
		return FALSE
	var/charged_kib = CEILING(filelength / 1024, 1)
	GLOB.audio_uploads.account_kib[ckey] -= request.reserved_kib - charged_kib
	GLOB.audio_uploads.upload_kib -= request.reserved_kib - charged_kib
	request.reserved_kib = charged_kib
	request.received_bytes = filelength
	GLOB.audio_uploads.next_transfer = world.time + 30 SECONDS
	return TRUE

/datum/audio_upload_request/proc/is_current(mob/check_user)
	return !finished && !QDELETED(check_user) && check_user == user && uploader && check_user.client == uploader && check_user.ckey == account && GLOB.audio_uploads.pending[account] == src

/datum/audio_upload_budget/proc/finish(datum/audio_upload_request/request)
	if(!request || request.finished)
		return
	request.finished = TRUE
	if(pending[request.account] == request)
		pending -= request.account
	if(!request.received_bytes)
		account_count[request.account]--
		account_kib[request.account] -= request.reserved_kib
		upload_count--
		upload_kib -= request.reserved_kib
	request.uploader = null
	request.user = null
	qdel(request)

/// Staging names contain no player-controlled text; playback retains a cache entry.
/datum/audio_upload_budget/proc/cache_song(datum/audio_upload_request/request, infile)
	if(staging_failed || !request.is_current(request.user) || !isfile(infile))
		return
	var/file_size = length(infile)
	if(!request.received_bytes || file_size != request.received_bytes || file_size > AUDIO_UPLOAD_MAX_BYTES || LOWER_TEXT(copytext("[infile]", -4)) != ".ogg")
		to_chat(request.user, span_warning("The song upload was incomplete or invalid."))
		return
	var/process_id = isnum(world.process) ? num2text(world.process, 20) : world.process
	var/staging_path = "data/audio-upload-[process_id].ogg"
	var/cached_song
	try
		if((!fexists(staging_path) || fdel(staging_path)) && fcopy(infile, staging_path) && length(file(staging_path)) == file_size)
			// The first page must be an Ogg version-zero beginning-of-stream page.
			var/encoded = rustg_hash_file(RUSTG_HASH_BASE64, staging_path)
			var/header = copytext(encoded, 1, 9)
			if(header == "T2dnUwAC" || header == "T2dnUwAG")
				var/list/lengths = rustg_sound_length_list(list(staging_path))
				var/list/successes = lengths?[RUSTG_SOUNDLEN_SUCCESSES]
				var/duration = text2num(successes?[staging_path])
				if(isnum(duration) && duration > 0 && duration < INFINITY)
					cached_song = fcopy_rsc(infile)
	catch(var/exception/error)
		log_runtime("Song upload validation failed: [error]")
	if(fexists(staging_path) && !fdel(staging_path))
		staging_failed = TRUE
		message_admins("Song uploads disabled: could not remove temporary audio staging file [staging_path].")
		return
	if(!cached_song)
		to_chat(request.user, span_warning("Could not read this OGG song. Please choose a valid OGG audio file."))
		return
	request.user.log_message("uploaded a song ([file_size] bytes) to the round audio cache", LOG_GAME)
	message_admins("[ADMIN_LOOKUPFLW(request.user)] uploaded a song of size [round(file_size / 1000000, 0.01)] MB.")
	return cached_song

#undef AUDIO_UPLOAD_MAX_BYTES
#undef AUDIO_UPLOAD_ACCOUNT_COUNT
#undef AUDIO_UPLOAD_GLOBAL_COUNT
#undef AUDIO_UPLOAD_ACCOUNT_KIB
#undef AUDIO_UPLOAD_GLOBAL_KIB
