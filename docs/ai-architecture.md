# AI and offline providers

Game Core is truth. AI is optional expression.

World snapshot → limited DialogueContext → DialogueProvider → unknown proposal → runtime validator → Interact command → Core validation → state.

M0 implements RuleBasedDialogueProvider and MockDialogueProvider only. A proposal contains the intended cat ID and bounded dialogue text. It cannot specify money, bond amounts, memory writes or arbitrary actions. Application handles rejection, timeout and fallback. Player text is bounded and treated as data; displayed via textContent.

Core derives memory and bond effects from game rules, independent of provider wording. Future external providers must add cancellation, disclosure/consent, privacy limits and captured validated outputs for reproducible playback before enabling network traffic. Gameplay RNG is never supplied to generative providers.
