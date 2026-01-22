# Magic organizer
This is a tool to track your magic cards and decks

## Scanning cards
We want to be able to scan cards by taking photos or uploading photos. And use the Prompt api to get the text out.

The card-reader component supports dynamic heading levels via `data-level` (default: 2) and custom heading text via `data-heading` (default: "card scanner").

## Listing all cards
There should be an index of all cards, this should be it's own html file that lives at "./src/library/index.html"