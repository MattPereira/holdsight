# Mask amounts in the display layer only

Hidden Amounts obscures Sensitive Values with a CSS blur applied from a class on the document root; the real values remain in the server-rendered HTML and the DOM. This defends against the actual threat — screenshots, screenshares and shoulder-surfing — while keeping the feature free of server plumbing, since redacting values server-side would make every loader, server action and cache key mode-aware. Anyone with devtools open can still read the underlying figures; that is accepted, not overlooked.
