/*
 * Copyright (C) 2016-2026 phantombot.github.io/PhantomBot
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/* global Packages */

(function () {
    let HttpClient = Packages.com.gmt2001.httpclient.HttpClient,
            HttpMethod = Packages.io.netty.handler.codec.http.HttpMethod,
            URIUtil = Packages.com.gmt2001.httpclient.URIUtil,
            // A reply arrow, optionally led by status codes, status classes, or ! for any other failure
            reArrow = /\s((?:\d{3}|[1-5]xx|0)(?:,(?:\d{3}|[1-5]xx|0))*|!)?->(?=\s|$)/gi,
            reRequest = /^(?:(GET|POST|PUT|PATCH|DELETE)\s+)?(https?:\/\/\S+)\s*([\s\S]*)$/i,
            reHeader = /^\[([\w-]+):\s*([^\]]*)\]\s*/,
            // $1-$9, but not the start of a longer number such as $10
            reArg = /\$[1-9](?!\d)/g,
            // An optional part of the url: square brackets around at least one of $1-$9
            reSection = /\[([^\[\]]*\$[1-9](?!\d)[^\[\]]*)\]/g,
            reFill = /\$secret\.(\w+)|\$([1-9])(?!\d)/g,
            reReply = /\{([\w.-]+)\}|\$status|\$([1-9])(?!\d)/g,
            reField = /\{[\w.-]+\}/;

    /*
     * @function parseTag
     *
     * @param {string} str the arguments of the tag
     * @returns {object} the parts of the request; null if str is not a request
     */
    function parseTag(str) {
        let parts = [],
                conditions = [],
                last = 0,
                match;

        reArrow.lastIndex = 0;
        while ((match = reArrow.exec(str)) !== null) {
            parts.push(str.substring(last, match.index));
            conditions.push(match[1] ? match[1].toLowerCase() : 'ok');
            last = reArrow.lastIndex;
        }
        parts.push(str.substring(last));

        match = parts[0].trim().match(reRequest);
        if (match === null) {
            return null;
        }

        let request = {
            method: match[1] ? match[1].toUpperCase() : 'GET',
            url: match[2],
            headers: [],
            body: '',
            replies: []
        },
                rest = match[3];

        while ((match = rest.match(reHeader)) !== null) {
            request.headers.push({name: match[1], value: match[2].trim()});
            rest = rest.substring(match[0].length);
        }
        request.body = rest.trim();

        for (let i = 0; i < conditions.length; i++) {
            request.replies.push({conditions: conditions[i].split(','), text: parts[i + 1].trim()});
        }

        return request;
    }

    /*
     * @function fill
     *
     * @param {string} str a part of the request
     * @param {array} cmdArgs the arguments of the command; null if there is no command
     * @param {function} encode encodes a value for the part of the request it is placed in
     * @returns {string} str with $1-$9 and $secret.name replaced
     */
    function fill(str, cmdArgs, encode) {
        return str.replace(reFill, function (match, secret, n) {
            if (secret) {
                let value = $.optIniDbString('apiSecrets', secret.toLowerCase());
                if (!value.isPresent()) {
                    throw 'no API secret named ' + secret;
                }
                return encode($.jsString(value.get()));
            }

            if (cmdArgs === null) {
                return match;
            }

            // Only an argument from an optional part of the url can be missing here
            let value = cmdArgs[parseInt(n) - 1];
            return value ? encode(value) : '';
        });
    }

    /*
     * @function fillSections
     *
     * @param {string} url the url of the request
     * @param {array} cmdArgs the arguments of the command; null if there is no command
     * @returns {string} url with each optional part kept if every argument in it was given, and removed if not
     */
    function fillSections(url, cmdArgs) {
        return url.replace(reSection, function (match, section) {
            let used = section.match(reArg);

            for (let i = 0; i < used.length; i++) {
                if (cmdArgs === null || !cmdArgs[parseInt(used[i].charAt(1)) - 1]) {
                    return '';
                }
            }

            return section;
        });
    }

    function encodeJson(str) {
        return JSON.stringify(str).slice(1, -1);
    }

    function encodeHeader(str) {
        return str.replace(/[\r\n]/g, '');
    }

    /*
     * @function send
     *
     * @param {object} request the parts of the request from parseTag
     * @param {array} cmdArgs the arguments of the command; null if there is no command
     * @param {boolean} acceptJson true if a reply reads a field from the response
     * @returns {object} the status code and body of the response; status 0 if there was no response
     */
    function send(request, cmdArgs, acceptJson) {
        let headers = HttpClient.createHeaders(),
                isJson = request.body.startsWith('{') || request.body.startsWith('['),
                body = null,
                response;

        try {
            if (request.body.length > 0) {
                headers.set('Content-Type', isJson ? 'application/json' : 'application/x-www-form-urlencoded');
                body = fill(request.body, cmdArgs, isJson ? encodeJson : encodeURIComponent);
                // HttpClient only sets this itself when there is no User-Agent header
                headers.set('Content-Length', String(new Packages.java.lang.String(body).getBytes('UTF-8').length));
            }
            if (acceptJson) {
                headers.set('Accept', 'application/json');
            }
            for (let i = 0; i < request.headers.length; i++) {
                headers.set(request.headers[i].name, fill(request.headers[i].value, cmdArgs, encodeHeader));
            }

            response = HttpClient.request(HttpMethod.valueOf(request.method), URIUtil.create(fill(request.url, cmdArgs, encodeURIComponent)), headers, body);
        } catch (ex) {
            $.log.error('(api) ' + request.method + ' ' + request.url + ' could not be sent: ' + ex);
            return {status: 0, body: ''};
        }

        if (response.hasException()) {
            $.log.error('(api) ' + request.method + ' ' + request.url + ' got no response: ' + response.exception());
            return {status: 0, body: ''};
        }

        return {status: response.responseCode().code(), body: $.jsString(response.responseBody())};
    }

    /*
     * @function findReply
     *
     * @param {array} replies the replies from parseTag
     * @param {array} conditions the conditions to look for, most specific first
     * @returns {object} the first reply with the most specific condition; null if there is none
     */
    function findReply(replies, conditions) {
        for (let i = 0; i < conditions.length; i++) {
            for (let b = 0; b < replies.length; b++) {
                if (replies[b].conditions.includes(conditions[i])) {
                    return replies[b];
                }
            }
        }

        return null;
    }

    /*
     * @function getField
     *
     * @param {object} json the parsed response
     * @param {string} path the keys leading to the field, separated by periods
     * @returns {string} the value of the field; empty if it is missing or null
     */
    function getField(json, path) {
        let keys = path.split('.'),
                value = json;

        for (let i = 0; i < keys.length; i++) {
            if (value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, keys[i])) {
                return '';
            }
            value = value[keys[i]];
        }

        if (value === null) {
            return '';
        }

        return typeof value === 'object' ? JSON.stringify(value) : String(value);
    }

    /*
     * @transformer api
     * @formula (api url:str) send a GET request and output the response text
     * @formula (api method:str url:str) send a request with the method GET, POST, PUT, PATCH, or DELETE and output the response text
     * @formula (api method:str url:str body:str) send a request with a body and output the response text
     * @formula (api method:str url:str [header:str: value:str] body:str) send a request with one or more headers; the body is optional
     * @formula (api method:str url:str body:str -> reply:str) send a request and output the reply; the method and body are optional
     * @labels twitch discord noevent commandevent api
     * @notes the url must start with `http://` or `https://`; headers must directly follow the url; the body is sent exactly as typed
     * @notes a body starting with `{` or `[` is sent as `application/json`; any other body is sent as `application/x-www-form-urlencoded`
     * @notes in a reply, `{field}` is replaced with that field of the JSON response, such as `{location.name}` or `{items.0.name}`; a missing field is left blank. `$status` is replaced with the HTTP status code, or `0` if there was no response
     * @notes ` -> ` starts the reply for a success. A reply can also be given for a status code (` 404-> `), several (` 401,403-> `), a class (` 5xx-> `), no response (` 0-> `), or any other failure (` !-> `). The most specific one is used. An arrow with nothing after it outputs nothing
     * @notes without a matching reply, a success outputs the response text and a failure outputs an error message
     * @notes `$1`-`$9` are replaced with the arguments of the command, encoded for the part of the request they are placed in. If the command was not given one of them, the tag outputs an error message and no request is sent
     * @notes a part of the url in square brackets that contains `$1`-`$9`, such as `[/$2]`, is only sent if every argument inside it was given. Those arguments are optional in the rest of the tag as well, and are left blank when missing
     * @notes `$secret.name` is replaced with an API secret saved in the panel. It can be used in the url, a header, or the body
     * @notes this tag can change data on the remote server. Anyone who can add or edit commands can use any saved API secret
     * @notes start the chat message with your own text, such as `-> Path: {path}`. A message that starts with `/` or `.` is treated as a Twitch command, which a field, an argument, or the response text could otherwise decide
     * @notes parentheses inside the tag must be escaped as `\(` and `\)`. Other tags inside the tag run before it does, whichever reply is used
     * @example Caster: !addcom !joke (api https://not.real.com/joke)
     * User: !joke
     * Bot: These jokes are un-bear-able
     * @example Caster: !addcom !weather (api https://not.real.com/weather?q=$1 -> Weather in {location.name}: {current.temp_f} F 404-> I do not know where $1 is !-> The weather service is not answering)
     * User: !weather 80314
     * Bot: Weather in Boulder: 75 F
     * User: !weather nowhere
     * Bot: I do not know where nowhere is
     * @example Caster: !addcom !rename (api PATCH https://not.real.com/item/$1 [Authorization: Bearer $secret.shop] {"name":"$2"} -> Renamed item $1 to {name})
     * User: !rename 5 banana
     * Bot: Renamed item 5 to banana
     * @example Caster: !addcom !song (api https://not.real.com/playlists/$1/songs[/$2] -> Now playing {title} by {artist})
     * User: !song chill
     * // requests https://not.real.com/playlists/chill/songs
     * User: !song chill 7
     * // requests https://not.real.com/playlists/chill/songs/7
     */
    function api(args) {
        let request = parseTag(args.args);

        if (request === null) {
            return;
        }

        let cmdArgs = null,
                used = args.args.match(reArg),
                // Arguments in an optional part of the url are optional everywhere in the tag
                optional = (request.url.match(reSection) || []).join('').match(reArg) || [],
                acceptJson = false;

        if (args.event !== undefined && args.event !== null && args.event.getArgs !== undefined) {
            cmdArgs = $.jsArgs(args.event.getArgs());
            for (let i = 0; used !== null && i < used.length; i++) {
                if (!cmdArgs[parseInt(used[i].charAt(1)) - 1] && !optional.includes(used[i])) {
                    return {result: $.lang.get('api.args.missing')};
                }
            }
        }

        request.url = fillSections(request.url, cmdArgs);

        for (let i = 0; i < request.replies.length; i++) {
            acceptJson = acceptJson || reField.test(request.replies[i].text);
        }

        let response = send(request, cmdArgs, acceptJson),
                isSuccess = response.status > 0 && response.status < 400,
                reply = findReply(request.replies, [String(response.status), Math.floor(response.status / 100) + 'xx', isSuccess ? 'ok' : '!']),
                json = {};

        $.consoleDebug('(api) ' + request.method + ' ' + request.url + ' -> ' + response.status + ' ' + response.body);

        if (!isSuccess && response.status > 0) {
            $.log.error('(api) ' + request.method + ' ' + request.url + ' returned ' + response.status);
        }

        if (reply !== null && reField.test(reply.text) && response.body.trim().length > 0) {
            try {
                json = JSON.parse(response.body);
            } catch (ex) {
                // A success was expected to be JSON; a failure just leaves the fields blank
                if (isSuccess) {
                    $.log.error('(api) ' + request.method + ' ' + request.url + ' did not return JSON');
                    isSuccess = false;
                    reply = findReply(request.replies, ['!']);
                }
            }
        }

        if (reply === null) {
            return {
                result: isSuccess ? response.body : $.lang.get('api.error'),
                cache: false
            };
        }

        return {
            result: reply.text.replace(reReply, function (match, path, n) {
                if (path) {
                    return getField(json, path);
                } else if (n) {
                    return cmdArgs === null ? match : (cmdArgs[parseInt(n) - 1] || '');
                }

                return response.status;
            }),
            cache: false
        };
    }

    $.transformers.addTransformers([
        new $.transformers.transformer('api', ['twitch', 'discord', 'noevent', 'commandevent', 'api'], api)
    ]);
})();
