const examples = {
    fixed: {
        reply: 'Thanks for reaching out. I’m away right now and will get back to you when I can.',
        description: 'Fixed replies use the message you set for each enabled contact.'
    },
    ai: {
        reply: 'Example instruction: Keep replies brief and friendly. Never share private owner information.',
        description: 'AI instructions guide generated replies. This example is not a live AI response.'
    }
};
document.querySelectorAll('[data-reply]').forEach(button => {
    button.addEventListener('click', () => {
        const example = examples[button.dataset.reply];
        document.querySelector('#sample-reply').textContent = example.reply;
        document.querySelector('#preview-description').textContent = example.description;
        document.querySelectorAll('[data-reply]').forEach(item => {
            item.setAttribute('aria-pressed', String(item === button));
        });
    });
});
