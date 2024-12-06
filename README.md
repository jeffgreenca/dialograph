# dialograph (experiment)

In my day job, I often find myself whiteboarding live during meetings to build a visual aid to anchor a discussion around some [complex topic](https://youtu.be/czzAVuVz7u4?si=lrp7opTO2vcNnVmm). There is typically a tradeoff between quality of the diagram and speed to draw. Especially in situations where the audience is external to my immediate teams, and therefore needs more contextual explanation, I noticed myself narrating the diagram while drawing it, and pausing to add labels with enough detail. This seemed like duplicate information, and I started to wonder if an AI agent could help.

Dialograph is an experimental, demonstration tool of the following:
1. Given a virtual whiteboard, the user may click anywhere - on click, a new rectangle is added to the canvas.
2. While adding rectangles, the user narrates into the computer microphone.
3. Dialograph magically adds labels and connections between rectangles based on the narration, in near real time.

Functionally, Dialograph's flow is:
1. As the user clicks on the canvas to create rectangles, these actions are timestamped. A unique ID is assigned to each rectangle for identification.
2. As the user speaks, speech to text is performed with timestamping, forming a transcript of the narration.
3. The rectangle actions are converted to textual descriptions, and merged with the transcript.
4. This merged transcript is provided to an LLM, which is prompted to respond with labels and connections for each rectangle.
5. The LLM output is parsed and the diagram updated by connecting nodes and updating labels for each rectangle.

This is a very hacky proof of concept to test out the idea. I had thought to integrate this with [https://excalidraw.com/](https://excalidraw.com/) but this seemed faster to prototype.

## Run

```
# start up the backend... sorry, the documentation is not good for this experiment :)
...

# start up the UI
$ cd ui
$ npm run dev
# open http://localhost:3000/draw
```

