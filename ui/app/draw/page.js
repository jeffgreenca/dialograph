'use client'
import React, { useEffect, useState } from 'react'

export default function Draw() {
    const makeRandomID = () => Math.random().toString(36).substring(8)

    const [rectangles, setRectangles] = useState([])
    const [actionLog, setActionLog] = useState([])
    const [connectingLines, setConnectingLines] = useState([])

    const [showRectangleDiagnostics, setShowRectangleDiagnostics] = useState(false)

    const unixTime = () => Math.floor(Date.now() / 1000);
    const [timeStart, _] = useState(unixTime())

    const addActionEntry = (action) => {
        setActionLog([...actionLog, { time: unixTime(), action }])
    }

    const [transcript, setTranscript] = useState([])

    // localStorage.setItem('openai-api-key', '')

    const completeGPT = (prompt) => {
        const url = "https://api.openai.com/v1/chat/completions"
        const payload = {
            "model": "gpt-4",
            "messages": [
                {
                    "role": "system",
                    "content": "You are a helpful assistant who enhances the diagram based on the transcript."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        }

        const openaiApiKey = localStorage.getItem('openai-api-key')

        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`,
            },
            body: JSON.stringify(payload),
        })
            .then(response => response.json())
            .then(data => {
                console.log('Success:', data);
                const text = data.choices[0].message.content;
                console.log(text)
                const actions = parseProposedActions(text)
                console.log(actions)
                // todo allow a preview / accept the actions
                performActions(actions)
            })
            .catch((error) => {
                console.error('Error:', error);
            });
    }

    const completeLocal = (prompt) => {
        const simpleOne = {
            "temperature": 0.9,
            "top_p": 0.9,
            "min_p": 0,
            "top_k": 20,
            "repetition_penalty": 1.15,
            "presence_penalty": 0.0,
            "frequency_penalty": 0.0,
            "typical_p": 1,
            "tfs": 1,
            "mirostat_mode": 0,
            "mirostat_tau": 5,
            "mirostat_eta": 0.1,
            "seed": -1,
            "max_tokens": 512,
        }
        const url = 'http://localhost:5000/v1/completions'
        const payload = {
            prompt,
            ...simpleOne
        }

        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        })
            .then(response => response.json())
            .then(data => {
                console.log('Success:', data);
                const text = data.choices[0].text;
                console.log(text)
                const actions = parseProposedActions(text)
                console.log(actions)
                // todo allow a preview / accept the actions
                performActions(actions)
            })
            .catch((error) => {
                console.error('Error:', error);
            });
    }

    const parseProposedActions = (text) => {
        // split text into lines
        const lines = text.split('\n')
        // look for LABEL: or CONNECT: and find the arguments, up to 2, that follow
        // the LABEL: or CONNECT: keyword does not have to be at the beginning
        const actions = lines.map(line => {
            const labelMatch = line.match(/SET_LABEL:\s*(\w+),\s*(.+)/)
            const connectMatch = line.match(/DRAW_LINE:\s*(\w+),\s*(\w+)/)
            if (labelMatch) {
                const [, id, label] = labelMatch
                return { type: 'SET_LABEL', id, label }
            } else if (connectMatch) {
                const [, id1, id2] = connectMatch
                return { type: 'DRAW_LINE', id1, id2 }
            } else {
                return null
            }
        }).filter(a => a !== null)
        return actions
    }

    const performActions = (actions) => {
        const newRectangles = rectangles.map(r => {
            const action = actions.find(a => a.id === r.id)
            if (action && action.type === 'SET_LABEL') {
                return { ...r, text: action.label }
            } else {
                return r
            }
        })
        setRectangles(newRectangles)

        // now process lines
        setConnectingLines([]) // clear lines
        actions.forEach(action => {
            if (action.type === 'DRAW_LINE') {
                addConnectingLine(action.id1, action.id2)
            }
        })
    }

    const handleCompleteClick = () => {
        const promptLocal = `<s>[INST]Transcript: ${mergedTranscript}

Allowed Actions:
LABEL: ID, my label

Instructions: The Transcript is a record of a person talking while creating a
diagram. Enhance the diagram. You can perform any of the Allowed Actions listed,
but no other actions. Respond with one line per action. It is important to
follow the allowed action format precisely. Use IDs from the diagram transcript.
[/INST]
`
        const promptGPT = `Transcript: ${mergedTranscript}

Allowed Actions:
SET_LABEL: ID, my label
DRAW_LINE: ID1, ID2

Instructions: The Transcript is a record of a person talking while creating a
diagram. Enhance the diagram. You can perform any of the Allowed Actions listed,
but no other actions. Respond with one line per action. It is important to
follow the allowed action format precisely. Use IDs from the diagram transcript.
[/INST]
`
        console.log(promptGPT)
        completeGPT(promptGPT)
    }

    const updateTranscript = () => {
        fetch('http://localhost:5051/transcript')
            .then(response => response.json())
            .then(data => {
                if (data.words.length > 0) {
                    console.log(data.words);
                }
                // TODO we should look at the data.wall_time which is the time on the server when it got our request
                // and then we should look at our own clock for when we issued the request
                // and then we should compute the time it took for the server to respond if we want to be semi-precise
                // finally we update the dat.words.wall_start and wall_end by the difference between our clock and the server clock
                // so that we can determine when actions were performed
                // this is obviously not a safe approach to concurrency. instead, we should use a database to hold the user actions
                // and make the server responsible for storing those, then the server can decide when the audio came in and use that to sync up
                // into order
                setTranscript(prevTranscript => [...prevTranscript, ...data.words]);
            })
            .catch(error => console.error('Error:', error))
    }

    useEffect(() => {
        document.title = "Draw"
    }, [])

    useEffect(() => {
        const interval = setInterval(() => {
            updateTranscript()
        }, 3000)
        return () => clearInterval(interval)
    }, [])

    const [mergedTranscript, setMergedTranscript] = useState("")

    const merge = () => {
        // build a merged transcript
        // by combining the words and the action log like this
        // "words words words [selected rectangle ID=xj31] words words words [created rectangle ID=3j1k] words"
        // using the time of the action log and the wall_start time of the words
        let transcriptIndex = 0;
        let actionIndex = 0;
        let merged = '';

        while (transcriptIndex < transcript.length || actionIndex < actionLog.length) {
            if (actionIndex >= actionLog.length ||
                (transcriptIndex < transcript.length && transcript[transcriptIndex].wall_start < actionLog[actionIndex].time)) {
                merged += transcript[transcriptIndex].word;
                transcriptIndex++;
            } else {
                merged += ' [user performed ' + actionLog[actionIndex].action.type + " on ID " + actionLog[actionIndex].action.id + '] ';
                actionIndex++;
            }
        }

        setMergedTranscript(merged);
    }

    useEffect(() => {
        merge()
    }, [transcript, actionLog])

    const handleSvgClick = (event) => {
        const { offsetX, offsetY } = event.nativeEvent
        const newRectangle = {
            id: makeRandomID(),
            x: offsetX - 50,
            y: offsetY - 50,
            width: 250,
            height: 100,
            fill: null,
            text: 'This is a new rectangle',
            created: unixTime(),
            selected: false,
        }
        setRectangles([...rectangles, newRectangle])

        addActionEntry({ type: "create_rectangle", id: newRectangle.id })
    }

    const addConnectingLine = (id1, id2) => {
        console.log("connecting", id1, id2)
        const newLine = { id1, id2 }
        // use a inline function to avoid overwriting
        setConnectingLines(connectingLines => [...connectingLines, newLine])
    }

    // now we create an effect that will paint any lines declared in state
    // by finding an appropriate connection point between the two referenced two rectangles
    // this effect will add all the lines to the lines SVG state
    // and then we will render them in JSX later below
    const [svgLines, setSvgLines] = useState([])
    useEffect(() => {
        const newSvgLines = connectingLines.map(line => {
            const r1 = rectangles.find(r => r.id === line.id1)
            const r2 = rectangles.find(r => r.id === line.id2)
            const x1 = r1.x + r1.width / 2
            const y1 = r1.y + r1.height / 2
            const x2 = r2.x + r2.width / 2
            const y2 = r2.y + r2.height / 2
            return { x1, y1, x2, y2 }
            /* this is a naieve example. instead, we want to find the edge of the rectangle that is closest to the other rectangle */
            /*
            const r1 = rectangles.find(r => r.id === line.id1)
            const r2 = rectangles.find(r => r.id === line.id2)
            // now we find the nearest edges of the two rectangles, rather than the center
            const findNearestEdges = (r1, r2) => {
                const distances = [
                    Math.abs(r1.x - (r2.x + r2.width)), // left edge of r1 to right edge of r2
                    Math.abs((r1.x + r1.width) - r2.x), // right edge of r1 to left edge of r2
                    Math.abs(r1.y - (r2.y + r2.height)), // top edge of r1 to bottom edge of r2
                    Math.abs((r1.y + r1.height) - r2.y) // bottom edge of r1 to top edge of r2
                ];
                const minDistance = Math.min(...distances);
                const nearestEdges = distances.map((distance, index) => {
                    if (distance === minDistance) {
                        switch (index) {
                            case 0:
                                return { edge1: 'left', edge2: 'right' };
                            case 1:
                                return { edge1: 'right', edge2: 'left' };
                            case 2:
                                return { edge1: 'top', edge2: 'bottom' };
                            case 3:
                                return { edge1: 'bottom', edge2: 'top' };
                            default:
                                return null;
                        }
                    }
                    return null;
                }).filter(edge => edge !== null);
                return nearestEdges;
            };

            const newSvgLines = connectingLines.map(line => {
                const r1 = rectangles.find(r => r.id === line.id1);
                const r2 = rectangles.find(r => r.id === line.id2);
                const nearestEdges = findNearestEdges(r1, r2);
                const { edge1, edge2 } = nearestEdges[0]; // assuming there is only one nearest edge pair
                let x1, y1, x2, y2;
                switch (edge1) {
                    case 'left':
                        x1 = r1.x;
                        y1 = r1.y + r1.height / 2;
                        break;
                    case 'right':
                        x1 = r1.x + r1.width;
                        y1 = r1.y + r1.height / 2;
                        break;
                    case 'top':
                        x1 = r1.x + r1.width / 2;
                        y1 = r1.y;
                        break;
                    case 'bottom':
                        x1 = r1.x + r1.width / 2;
                        y1 = r1.y + r1.height;
                        break;
                }
                switch (edge2) {
                    case 'left':
                        x2 = r2.x;
                        y2 = r2.y + r2.height / 2;
                        break;
                    case 'right':
                        x2 = r2.x + r2.width;
                        y2 = r2.y + r2.height / 2;
                        break;
                    case 'top':
                        x2 = r2.x + r2.width / 2;
                        y2 = r2.y;
                        break;
                    case 'bottom':
                        x2 = r2.x + r2.width / 2;
                        y2 = r2.y + r2.height;
                        break;
                }
                return { x1, y1, x2, y2 };
            });

            return newSvgLines;
            */
        })
        setSvgLines(newSvgLines)
    }, [connectingLines, rectangles])

    const handleRectangleClick = (id, event) => {
        // toggle selected for the clicked rectangle
        const newRectangles = rectangles.map(r => r.id === id ? { ...r, selected: !r.selected } : { ...r, selected: false })
        setRectangles(newRectangles)
        event.stopPropagation()

        addActionEntry({ type: "select_rectangle", id })
    }

    return (
        <div style={{ width: "100%", height: "100vh" }}>
            <button onClick={handleCompleteClick}>Do Complete</button>
            <svg style={{ width: "80%", border: "1px solid green", float: "left" }} width="80%" height="100%" onClick={handleSvgClick}>
                {svgLines.map((line, index) => (
                    <line key={index} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} style={{ stroke: "black", strokeWidth: 2 }} />
                ))}
                {rectangles.map((r, index) => (
                    <Rectangle
                        key={index}
                        id={r.id}
                        x={r.x}
                        y={r.y}
                        w={r.width}
                        h={r.height}
                        fill={r.fill}
                        text={r.text}
                        selected={r.selected}
                        onClick={handleRectangleClick}
                    />
                ))}
            </svg>
            <div style={{ width: "20%", height: "100%", backgroundColor: "lightgray", float: "right" }}>
                <p>Merged</p>
                <p>{mergedTranscript}</p>
                <p><input type="checkbox" checked={showRectangleDiagnostics} onChange={() => setShowRectangleDiagnostics(!showRectangleDiagnostics)} /> rectangles</p>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: '0.5em', display: showRectangleDiagnostics ? "block" : "none" }}>
                    {JSON.stringify(rectangles, null, 2)}
                </pre>
                <p>Transcript</p>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: '0.5em' }}>
                    {transcript.map((w) => w.word).join(' ')}
                </pre>
                <p>action log</p>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: '0.5em' }}>
                    {JSON.stringify(actionLog.slice().reverse(), null, 2)}
                </pre>
            </div>
        </div>
    )
}

function Rectangle({ id, x, y, w, h, border: borderColor, fill, text, selected, onClick: onClickHandler }) {
    const style = {
        fill: fill || 'rgba(255, 255, 255, 1)',
        stroke: (selected && "aquamarine") || borderColor || "black",
        strokeWidth: 2,
    }

    return (
        <g onClick={(e) => onClickHandler(id, e)}>
            <rect x={x} y={y} width={w} height={h} style={style} />
            <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="middle" fontSize="0.8em">{text}</text>
            <text x={x} y={y} textAnchor="top" dominantBaseline="top" dx="2px" dy="1.1em" style={{ fontSize: "0.5em" }}>{id}</text>
        </g>
    )
}