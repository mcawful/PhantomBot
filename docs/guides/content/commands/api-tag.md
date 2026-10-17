# The (api) Command Tag

The `(api)` command tag sends a request to a web API and puts the answer in chat. It can be used anywhere a custom command tag can be used, such as custom commands, keywords, Channel Points rewards, and Discord commands.

It supports the `GET`, `POST`, `PUT`, `PATCH`, and `DELETE` methods, request headers, a request body, and saved secrets such as API keys.

The older `(customapi)`, `(customapijson)`, and `(customapipost)` tags continue to work and have not changed.

&nbsp;

<!-- toc -->

<!-- tocstop -->

&nbsp;

## Quick Examples

Output the text an API returns

```text
!addcom !joke (api https://example.com/joke)
```

Pick fields out of a JSON response

```text
!addcom !weather (api https://example.com/weather?q=$1 -> Weather in {location.name}: {current.temp_f} F)
```

Send a JSON body with an API key in a header

```text
!addcom !rename (api PATCH https://example.com/item/$1 [Authorization: Bearer $secret.shop] {"name":"$2"} -> Renamed item $1 to {name})
```

Say something different when the API does not find what was asked for

```text
!addcom !player (api https://example.com/player/$1 -> {name} is level {level} 404-> No player called $1 !-> The lookup failed)
```

&nbsp;

## Layout

```text
(api METHOD url [Header: value] body -> reply)
```

Only the URL is required. The parts must be in this order.

| Part | Description |
|------|-------------|
| `METHOD` | `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`. `GET` is used if it is left out |
| `url` | The address to send the request to. It must start with `http://` or `https://` and cannot contain spaces |
| `[Header: value]` | A request header. Any number of headers can be added, directly after the URL. A header value cannot contain `]` |
| `body` | The data to send. Everything between the URL or headers and the first arrow is sent exactly as typed |
| `-> reply` | What to say in chat. See [Replies](#replies) |

A body that starts with `{` or `[` is sent as JSON (`Content-Type: application/json`). Any other body is sent as form data (`Content-Type: application/x-www-form-urlencoded`). Add a `[Content-Type: ...]` header to send something else.

If there is no URL after `(api`, the tag does nothing and the text is left as it is.

&nbsp;

## Replies

Without a reply, the tag outputs the text of the response.

With a reply, the tag outputs the reply. These are replaced inside it

| In the reply | Replaced with |
|--------------|---------------|
| `{field}` | A field of the JSON response. Use periods to go deeper, such as `{location.name}`, and a number for an item in a list, such as `{items.0.name}`. A field that is missing is left blank |
| `$status` | The HTTP status code of the response, or `0` if there was no response |
| `$1` to `$9` | The arguments of the command |

Braces always mean a field of the response. This is the opposite of `(customapijson)`, where braces mean plain text.

If a reply reads a field and a successful response is not JSON, the request counts as a failure: the ` !-> ` reply is used, or the error message if there is none.

**IMPORTANT:** Start the chat message with your own text, such as `-> Path: {path}` instead of `-> {path}`, or `Joke: (api https://example.com/joke)` instead of `(api https://example.com/joke)`. The bot treats a chat message that starts with `/` or `.` as a Twitch command. An unknown command is not shown in chat, and a known one, such as `/timeout` or `/ban`, is carried out by the bot. If the message starts with a field, an argument, or the text of the response, the API or a viewer decides how it starts.

### Replies For Different Results

A tag can have several replies. The arrow in front of each reply decides when it is used

| Arrow | Used when |
|-------|-----------|
| ` -> ` | The request succeeded (any status code below 400) |
| ` 404-> ` | The status code is exactly that code |
| ` 401,403-> ` | The status code is one of those codes |
| ` 4xx-> ` or ` 5xx-> ` | The status code starts with that number |
| ` 0-> ` | There was no response, such as a timeout, or the request could not be sent |
| ` !-> ` | Any other failure (a status code of 400 or above, or no response) |

An arrow needs a space before it and a space after it.

The most specific reply is used: first one for the exact status code, then one for the class of status code, then ` -> ` or ` !-> `.

```text
(api https://example.com/player/$1 -> {name} is level {level} 404-> No player called $1 401,403-> The bot is not allowed to look that up 5xx-> The game servers are down 0-> The service did not answer !-> Lookup failed \($status\))
```

If none of the replies fit, the tag outputs the text of the response for a success, or `The API request failed.` for a failure.

An arrow with nothing after it outputs nothing. This command sends the request and stays quiet when it works

```text
!addcom !notify (api POST https://example.com/hook msg=$1 -> )
```

A reply for a failure can also use fields, if the API returns JSON with its errors

```text
(api https://example.com/player/$1 -> {name} is level {level} !-> Lookup failed: {error.message})
```

Every failure is written to the bot's error log, including ones that have their own reply.

&nbsp;

## Arguments

`$1` to `$9` are replaced with the arguments given to the command. They are encoded for the place they are put in, so a viewer cannot change the request by typing special characters

| Place | Encoding |
|-------|----------|
| URL | URL encoded |
| Form body | URL encoded |
| JSON body | Escaped for a JSON string. Put the argument inside quotes, such as `{"name":"$1"}` |
| Header | Used as typed |
| Reply | Used as typed |

If the tag uses an argument that was not given to the command, the tag outputs `The command requires parameters.` and no request is sent, unless the argument is in an [optional part of the URL](#optional-parts-of-the-url).

A `$` followed by a single digit is always an argument, anywhere in the tag. Write a price such as `$5` as `5 dollars`. A longer number, such as `$10`, is left as it is.

The arguments are split the same way as for every other command. Double quotes group words into one argument and are removed, so `!rename 5 "big banana"` makes `$2` be `big banana`. To include a double quote in an argument, type it as `\"`.

### Optional Parts Of The URL

A part of the URL in square brackets that contains an argument is only sent if that argument was given. This lets one command use an argument when there is one, and leave it out when there is not

```text
!addcom !song (api https://example.com/playlists/$1/songs[/$2] -> Now playing {title} by {artist})
```

| Typed in chat | Request |
|---------------|---------|
| `!song chill` | `https://example.com/playlists/chill/songs` |
| `!song chill 7` | `https://example.com/playlists/chill/songs/7` |
| `!song` | None. The tag outputs `The command requires parameters.`, because `$1` is not in brackets |

This also works for query parameters, such as `https://example.com/search?q=$1[&page=$2]`. If the brackets contain more than one argument, all of them must be given for the part to be sent.

Arguments are filled in the order they are typed, so a later optional part cannot be used without the earlier ones. With `?q=$1[&page=$2][&sort=$3]`, typing `!search cats new` sets the page to `new`, and there is no way to give a sort without a page. Keep optional parts simple: one optional part per command works best. If more than one is needed, put the one used most often first, and use separate commands for combinations that are needed on their own.

An argument that is used inside brackets is optional everywhere in the tag. If it was not given, it is left blank in the body, headers, and replies.

Square brackets in the URL that do not contain an argument are sent as they are.

Use `$1` to `$9` for anything typed by a viewer. Other tags, such as `(1)` or `(sender)`, are replaced before the `(api)` tag runs and are **not** encoded. Their text is read as part of the `(api)` tag, so a viewer could type `$secret.` and a name to put any saved secret into the request, or add a header or a reply.

&nbsp;

## API Secrets

An API secret is a saved value, such as an API key or a password, that can be used in a request without writing it into the command.

To save a secret

1. Open the panel and go to _Commands_ > _Custom_, or _Discord_ > _Custom_
2. Click _API Secrets_
3. Enter a name and the value, then click _Save_

Saving and removing secrets needs write access to the _Commands_ section of the panel, also on the Discord page.

The name can contain letters, numbers, and underscores. A saved secret cannot be viewed again. To change a secret, save it again with the same name.

The dialog lists the names of the secrets that have been saved under _Saved Secrets_. To remove a secret, select its name there and click _Remove_.

To use a secret, write `$secret.` followed by its name in the URL, a header, or the body

```text
(api https://example.com/weather?key=$secret.weather&q=$1 -> Weather in {location.name})
(api POST https://example.com/hook [Authorization: Bearer $secret.hook] msg=$1 -> Sent)
```

Secrets are encoded the same way as arguments. They are never replaced in a reply.

Because a secret is encoded, a `/` in a secret placed in the URL is sent as `%2F`. If a URL needs a `/` between two private values, such as the id and token of a webhook, save them as two secrets.

**WARNING:** Anyone who can add or edit commands, keywords, or other responses that use command tags can use any saved secret, including in a request to a server of their own. Only give that access to people you trust with your secrets.

**NOTE:** An API that sends the request back in its response can cause a secret to be shown in chat.

&nbsp;

## Things To Know

- The tag can change or delete data on the remote server. Consider who is allowed to use the command, and set a cooldown on it to stay within the limits of the API
- Parentheses inside the tag must be written as `\(` and `\)`
- Other tags inside a reply run before the `(api)` tag does, whichever reply is used. A tag that only outputs text, such as `(sender)`, works as expected. A tag that does something, such as `(playsound)`, runs every time
- If the API redirects the request to another address, the bot follows it. The headers of the request are sent to the new address as well, except for `Authorization`
- A user name and password in the URL, such as `https://user:pass@example.com`, are not sent. Use an `Authorization` header instead
- With the `wsdebug` or `httpclientdebug` bot property on, the values of saved secrets can be written to the bot's debug log. Turn them off again after debugging
- The request times out after 10 seconds by default. This is controlled by the `httpclienttimeout` bot property
- Fields with a space or a period in their name cannot be used in a reply
