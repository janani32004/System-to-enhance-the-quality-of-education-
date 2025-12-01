import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { Container, Row, Col, Card, Navbar, Button, Form, Spinner, Alert, InputGroup } from 'react-bootstrap'; // ADDED: InputGroup, Alert

const API_URL = 'http://localhost:8000';

// --- Helper Components ---
const MarkdownRenderer = ({ content }) => {
    let html = content;
    
    // Ensure content is a string
    if (typeof html !== 'string') return <div className="markdown-content"></div>;

    // 👇 CRITICAL FIX 1: Handle Fenced Code Blocks (e.g., ```table content```)
    // Use the robust [\s\S]*? pattern to capture all content across multiple lines 
    // and force monospaced rendering for the table. This MUST run first.
    html = html.replace(/```([\s\S]*?)```/gs, (match, codeContent) => {
        const cleanedCode = codeContent.trim();
        // Use <pre><code> for clean, monospaced, aligned display
        return `
            <div style="background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 0.25rem; padding: 1rem; overflow-x: auto; margin-top: 1rem; margin-bottom: 1rem;">
                <pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word;"><code>${cleanedCode}</code></pre>
            </div>
        `;
    });
    
    // 👇 CRITICAL FIX 2: Handle Basic Markdown Tables (Header + Content)
    // Relaxed regex to capture header and all subsequent pipe-starting lines
    const tableRegex = /(\|.*?\|[\r\n]+)([\s\S]*?)(?=\n[ \t]*[^|]|$)/g;

    html = html.replace(tableRegex, (match, headerLine, contentBlock) => {
        
        // 1. Process Header Line
        const headers = headerLine.split('|')
                          .map(h => h.trim())
                          .filter(h => h && !h.match(/^[-: ]+$/)); // Filter out the separator if accidentally captured
        
        // Check if this is a table we should apply row-spanning to (like the Timetable)
        const isTimetable = headers.length >= 4 && headers[0].toLowerCase() === 'day';

        if (!isTimetable) {
            // If it's not the timetable, return the simple HTML table structure (from previous step)
            let simpleTableHtml = '<table class="table table-bordered table-striped mt-3"><thead>';
            simpleTableHtml += '<tr>' + headers.map(h => `<th style="text-align: left; font-weight: bold; background-color: #f2f2f2;">${h}</th>`).join('') + '</tr>';
            simpleTableHtml += '</thead><tbody>';

            contentBlock.trim().split('\n').forEach(row => {
                if (row.trim().startsWith('|') && !row.trim().match(/^\|[ -:]*\|[ -:]*\|/)) {
                    const cells = row.split('|').map(c => c.trim()).filter(c => c);
                    if (cells.length > 0) {
                        simpleTableHtml += '<tr>' + cells.map(c => `<td style="text-align: left;">${c}</td>`).join('') + '</tr>';
                    }
                }
            });
            simpleTableHtml += '</tbody></table>';
            return simpleTableHtml;
        }

        // --- ROW SPAN & CELL ALIGNMENT LOGIC FOR TIMETABLE ---
        let tableData = [];
        let rowGroups = {}; 
        let currentDay = null;

        // a. Parse Content Block into structured data
        contentBlock.trim().split('\n').forEach(row => {
            if (row.trim().startsWith('|') && !row.trim().match(/^\|[ -:]*\|[ -:]*\|/)) {
                // Get all cells, including empty ones, between the outer pipes
                const cells = row.split('|').map(c => c.trim()); 
                const rawCells = cells.filter((c, i) => i > 0 && i < cells.length - 1); 

                if (rawCells.length >= 3) { 
                    // Pad the array to ensure 4 data cells: [Day, Subject, Chapters, Time]
                    while (rawCells.length < 4) rawCells.push('');

                    let cell_Day = rawCells[0] || '';
                    let cell_Subject = rawCells[1] || ''; 
                    let cell_Chapters = rawCells[2] || '';
                    let cell_Time = rawCells[3] || ''; 
                    
                    // 💡 FIX: Explicitly correct cell shifting if Day is blank and Subject looks like a number (e.g., a Chapter count)
                    if (!cell_Day.startsWith('Day') && cell_Subject.match(/^[0-9.]*$/) && cell_Chapters && !cell_Time) {
                        // Pattern detected: Day is blank, Subject is a number, Chapters/Time are present but shifted left.
                        cell_Time = cell_Chapters;
                        cell_Chapters = cell_Subject;
                        cell_Subject = ''; // Subject is confirmed missing/blank
                    }

                    // Determine Day for rowspan grouping
                    if (cell_Day.startsWith('Day')) {
                        currentDay = cell_Day;
                    } else {
                        cell_Day = currentDay;
                    }

                    // The cells to be rendered are Subject, Chapters, and Time.
                    const rowObject = {
                        day: cell_Day,
                        subjectCells: [cell_Subject, cell_Chapters, cell_Time] // Use the explicitly set cells
                    };
                    
                    tableData.push(rowObject);

                    // Grouping logic for rowspan
                    if (rowGroups[cell_Day]) {
                        rowGroups[cell_Day].count++;
                    } else {
                        rowGroups[cell_Day] = { count: 1, firstRowIndex: tableData.length - 1 };
                    }
                }
            }
        });


        // b. Generate HTML Table with Rowspan
        let tableHtml = '<table class="table table-bordered table-striped mt-3"><thead>';
        // Headers (use the original headers array)
        tableHtml += '<tr>' + headers.map(h => `<th style="text-align: left; font-weight: bold; background-color: #f2f2f2;">${h}</th>`).join('') + '</tr>';
        tableHtml += '</thead><tbody>';

        tableData.forEach((rowData, index) => {
            const day = rowData.day;
            const group = rowGroups[day];

            tableHtml += '<tr>';

            // Only render the 'Day' cell for the first row of its group
            if (index === group.firstRowIndex) {
                // Apply the rowspan attribute
                tableHtml += `<td rowspan="${group.count}" style="text-align: left; font-weight: bold; background-color: #e9e9e9;">${day}</td>`;
            }

            // Render Subject and other cells
            tableHtml += rowData.subjectCells.map(c => `<td style="text-align: left;">${c}</td>`).join('');
            
            tableHtml += '</tr>';
        });
        
        tableHtml += '</tbody></table>';
        return tableHtml;
    });


    // ... (Headings, Bold, Lists, Newlines remain the same) ...
    html = html.replace(/## (.*)/g, '<h4>$1</h4>'); 
    html = html.replace(/# (.*)/g, '<h3>$1</h3>');
    
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    html = html.replace(/---/g, '<hr>');

    html = html.replace(/^\* (.*)/gm, '<li>$1</li>');
    if (html.includes('<li>')) {
        html = html.replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>').replace(/<\/ul><ul>/gs, '');
    }

    html = html.replace(/\n\n/g, '<p></p>');
    html = html.replace(/\n/g, '<br>');

    return <div className="markdown-content" dangerouslySetInnerHTML={{ __html: html }} />;
};

// Dashboard.js (Inside the AgriTechHub component)
const AgriTechHub = () => {
    const [file, setFile] = useState(null);
    // 💡 NEW STATE: Track the desired cure language
    const [language, setLanguage] = useState('Hindi'); // Default language
    const [result, setResult] = useState('Upload a leaf image for diagnosis.');
    const [loading, setLoading] = useState(false);
    const { token } = useAuth();
    
    // ... other handlers ...

    const handleDetect = async () => {
        if (!file) {
            alert('Please select a file first.');
            return;
        }

        setLoading(true);
        setResult('Diagnosing and generating cure...');

        const formData = new FormData();
        
        // 💡 CRITICAL FIX 1: Change 'file' to 'image_file' to match server-side File(...) name
        formData.append('image_file', file);
        
        // 💡 CRITICAL FIX 2: Change 'local_language' to 'language' to match server-side Form(...) name
        formData.append('language', language); 

        try {
            const response = await fetch(`${API_URL}/api/v1/agri-tech-disease-detect`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                // IMPORTANT: Do not set Content-Type header manually when using FormData
                body: formData,
            });

            if (response.status === 401) {
                 // Handle unauthorized
                 setResult(`❌ Error: Unauthorized. Please log in again.`);
                 setLoading(false);
                 return;
            }

            const data = await response.json();

            if (response.ok) {
                // 💡 UPDATED: Display structured results (Assuming server response structure)
                // Note: The structure here relies on the server sending { disease, cure_localized, language }
                const diseaseName = data.disease || 'N/A';
                const cureText = data.cure_localized || 'No cure information available.';
                const responseLang = data.language || language;
                
                setResult(
                    `✅ **Diagnosis Complete**\n\n` +
                    `**Disease Detected:** ${diseaseName}\n\n` +
                    `--- 🌿 CURE (Generated by ai in ${responseLang}) 🌿 ---\n\n` +
                    `${cureText}`
                );
            } else {
                // Display the specific validation errors from the 422 response body if available
                const errorDetail = data.detail ? 
                                    (Array.isArray(data.detail) ? data.detail.map(d => `${d.loc.slice(-1)}: ${d.msg}`).join('\n') : data.detail) : 
                                    'Could not process request.';

                setResult(`❌ Error: ${errorDetail}`);
                console.error("Server Error Details:", data.detail);
            }
        } catch (error) {
            console.error('Detection Error:', error);
            setResult(`❌ Network Error: Could not connect to the server.`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="glass shadow-lg p-4">
            <h2 className="fs-4 fw-bold mb-3">🌿 Agri-Tech Disease Detection</h2>
            <Form>
                <Form.Group controlId="formFile" className="mb-3">
                    <Form.Label>Upload Leaf Image</Form.Label>
                    <Form.Control type="file" onChange={(e) => setFile(e.target.files[0])} accept="image/*" />
                </Form.Group>
                
                {/* 💡 NEW: Language Input */}
                <Form.Group controlId="formLanguage" className="mb-3">
                    <Form.Label>Cure Language</Form.Label>
                    <Form.Control 
                        type="text" 
                        placeholder="e.g., Hindi, Marathi, Telugu" 
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)} 
                    />
                    <Form.Text className="text-muted">
                        Enter the local language for the treatment guide.
                    </Form.Text>
                </Form.Group>

                <Button 
                    variant="success" 
                    onClick={handleDetect} 
                    disabled={loading || !file}
                    className="w-100"
                >
                    {loading ? <Spinner animation="border" size="sm" /> : 'Detect Disease & Get Cure'}
                </Button>
            </Form>
            
            <hr className="my-3"/>

            <Card className="p-3 bg-light-subtle">
                <h3 className="fs-6 fw-semibold mb-2">Diagnosis Result:</h3>
                <MarkdownRenderer content={result} />
            </Card>
        </Card>
    );
};

// --- NEW HELPER FOR YOUTUBE EMBED ---
const getYouTubeEmbedUrl = (url) => {
    try {
        const urlObj = new URL(url);
        // Handle standard watch link
        if (urlObj.hostname.includes('youtube.com') && urlObj.searchParams.has('v')) {
            const videoId = urlObj.searchParams.get('v');
            return `https://www.youtube.com/embed/${videoId}`;
        }
        // Handle short-form youtu.be link
        if (urlObj.hostname === 'youtu.be') {
            const videoId = urlObj.pathname.substring(1);
            return `https://www.youtube.com/embed/${videoId}`;
        }
    } catch (e) {
        console.error("Invalid URL for YouTube embed:", url);
    }
    // Fallback URL
    return "https://www.youtube.com/embed/dQw4w9WgXcQ"; 
};

// 📚 Video Learning Hub Component (GenAI for Video Suggestion & Notes) - (NEW FEATURE)
const VideoLearningHub = () => {
    const [topic, setTopic] = useState('');
    const [language, setLanguage] = useState('English');
    const [result, setResult] = useState(null); // { video_title, video_url, notes_markdown }
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { token } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setResult(null);

        try {
            const response = await fetch(`${API_URL}/api/v1/topic-video-notes`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ topic, language }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Failed to fetch AI results.');
            }

            const data = await response.json();
            setResult(data);
        } catch (err) {
            console.error(err);
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    const embedUrl = result ? getYouTubeEmbedUrl(result.video_url) : null;

    return (
        <Card className="glass shadow-lg p-4 h-100">
            <h3 className="fs-5 fw-semibold mb-3 accent-text">AI Video Learning Hub</h3>
            <p className="small-muted mb-4">Get the best video and important notes for any topic using Gen AI.</p>

            <Form onSubmit={handleSubmit} className="mb-4">
                <Form.Group className="mb-3">
                    {/* 👇 JSX FIX: Changed </Label> to </Form.Label> */}
                    <Form.Label>Topic Name</Form.Label>
                    <Form.Control 
                        type="text" 
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="e.g., Python FastAPI"
                        required
                        disabled={loading}
                    />
                </Form.Group>
                <Form.Group className="mb-4">
                    <Form.Label>Language</Form.Label>
                    <Form.Control 
                        type="text" 
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        placeholder="e.g., Hindi, English"
                        required
                        disabled={loading}
                    />
                </Form.Group>
                <Button 
                    type="submit" 
                    className="w-100 btn-grad py-2 fw-semibold" 
                    disabled={loading || !topic || !language}
                >
                    {loading ? <Spinner animation="border" size="sm" /> : 'Suggest Video & Notes'}
                </Button>
            </Form>

            {error && <div className="alert alert-danger small">{error}</div>}

            {result && (
                <div>
                    <h4 className="fs-6 fw-bold mt-4 mb-2">Video Suggestion: {result.video_title}</h4>
                    {/* YouTube Embed */}
                    <div className="ratio ratio-16x9 mb-4">
                        <iframe 
                            src={embedUrl}
                            title={result.video_title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                            allowFullScreen
                            className="rounded shadow"
                        ></iframe>
                    </div>

                    <h4 className="fs-6 fw-bold mt-4 mb-2">Important AI-Generated Notes</h4>
                    <Card className="p-3 notes-output-card" style={{ backgroundColor: 'var(--bs-body-bg)' }}>
                        <MarkdownRenderer content={result.notes_markdown} />
                    </Card>
                </div>
            )}

            {!result && !loading && (
                <div className="text-center small-muted mt-3">Enter a topic to start learning!</div>
            )}
        </Card>
    );
};

// ⏰ NEW FEATURE: Timetable Generator Component
const TimetableGenerator = () => {
    const [subjects, setSubjects] = useState([
        { subject: 'Math', chapters: 10 },
        { subject: 'Science', chapters: 8 }
    ]);
    const [totalDays, setTotalDays] = useState(7);
    const [result, setResult] = useState('Enter your study constraints and click Generate.');
    const [loading, setLoading] = useState(false);
    const { token } = useAuth();
    const [error, setError] = useState('');

    // Helper to add a new subject entry
    const handleAddSubject = () => {
        setSubjects([...subjects, { subject: '', chapters: 1 }]);
    };

    // Helper to update a subject entry
    const handleSubjectChange = (index, field, value) => {
        const newSubjects = [...subjects];
        // Ensure chapters is an integer
        newSubjects[index][field] = field === 'chapters' ? parseInt(value) || 0 : value;
        setSubjects(newSubjects);
    };

    // Helper to remove a subject entry
    const handleRemoveSubject = (index) => {
        setSubjects(subjects.filter((_, i) => i !== index));
    };

    const handleGenerate = async () => {
        setError('');
        if (subjects.length === 0 || totalDays < 1) {
            setError('Please add at least one subject and specify total days.');
            return;
        }

        const validSubjects = subjects.filter(s => s.subject.trim() !== '' && s.chapters > 0);
        if (validSubjects.length === 0) {
             setError('Please ensure all subjects have a name and positive number of chapters.');
            return;
        }

        setLoading(true);
        setResult('Generating detailed timetable...');

        try {
            const requestBody = {
                subjects: validSubjects,
                total_days: totalDays,
            };

            const response = await fetch(`${API_URL}/api/v1/generate-timetable`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(requestBody),
            });

            const data = await response.json();

            if (response.ok) {
                // 👇 CRITICAL FIX: Use markdown bolding and double newlines for consistent markdown parsing
               setResult(
                    `✅ **Timetable Generated Successfully!**\n\n` +
                    `**Study Period:** ${totalDays} days.\n\n` +
                    `${data.timetable_markdown}` // This is assumed to contain the markdown table
                );
            } else {
                 const errorDetail = data.detail ? 
                                    (Array.isArray(data.detail) ? data.detail.map(d => `${d.loc.slice(-1)}: ${d.msg}`).join('\n') : data.detail) : 
                                    'Could not process request.';
                setResult(`❌ Error: ${errorDetail}`);
            }
        } catch (error) {
            console.error('Timetable Generation Error:', error);
            setResult(`❌ Network Error: Could not connect to the server.`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="glass shadow-lg p-4 mt-4">
            <h3 className="fs-5 fw-semibold mb-3">⏱️ Timetable Generator (Gen AI)</h3>
            
            <Form>
                <Form.Group className="mb-3">
                    <Form.Label>Total Study Days Available</Form.Label>
                    <Form.Control 
                        type="number" 
                        value={totalDays}
                        onChange={(e) => setTotalDays(parseInt(e.target.value) || 1)}
                        min="1"
                        required
                        disabled={loading}
                    />
                    <Form.Text className="text-muted">
                        AI will distribute the workload over this many days.
                    </Form.Text>
                </Form.Group>

                <Form.Label className="mt-3">Subjects and Chapters to Complete</Form.Label>
                {subjects.map((s, index) => (
                    <Row key={index} className="mb-2 align-items-end">
                        <Col xs={5}>
                            <Form.Control
                                type="text"
                                placeholder="Subject Name"
                                value={s.subject}
                                onChange={(e) => handleSubjectChange(index, 'subject', e.target.value)}
                                disabled={loading}
                            />
                        </Col>
                        <Col xs={4}>
                            <Form.Control
                                type="number"
                                placeholder="Chapters"
                                value={s.chapters}
                                onChange={(e) => handleSubjectChange(index, 'chapters', e.target.value)}
                                min="1"
                                disabled={loading}
                            />
                        </Col>
                         <Col xs={3} className="d-flex justify-content-end">
                             <Button 
                                variant="outline-danger" 
                                size="sm" // Use small size for better fit
                                onClick={() => handleRemoveSubject(index)}
                                disabled={subjects.length === 1 || loading}
                             >
                                Remove
                            </Button>
                        </Col>
                    </Row>
                ))}
                
                <Button 
                    variant="outline-primary" 
                    onClick={handleAddSubject} 
                    className="w-100 mt-2 mb-4"
                    disabled={loading}
                >
                    + Add Subject
                </Button>

                {error && <Alert variant="danger" className="small">{error}</Alert>}

                <Button 
                    variant="primary" // Changed to primary for better contrast
                    onClick={handleGenerate} 
                    disabled={loading || subjects.length === 0 || totalDays < 1}
                    className="w-100"
                >
                    {loading ? <Spinner animation="border" size="sm" /> : 'Generate Timetable'}
                </Button>
            </Form>

            <hr className="my-3"/>

            <Card className="p-3 bg-light-subtle">
                <h3 className="fs-6 fw-semibold mb-2">Generated Schedule:</h3>
                <MarkdownRenderer content={result} />
            </Card>
        </Card>
    );
};

// 💰 NEW FEATURE: Scholarship Portal Button
const ScholarshipPortalButton = () => {
    const handleRedirect = () => {
        window.open('https://scholarships.gov.in/', '_blank');
    };

    return (
        <Card className="glass shadow-lg p-4 mt-4 text-center">
            <h3 className="fs-5 fw-semibold mb-3">💰 Find Scholarships</h3>
            <p className="small-muted">Access the official National Scholarship Portal (NSP) to find government schemes.</p>
            <Button 
                variant="info" 
                onClick={handleRedirect} 
                className="w-100 py-2 fw-semibold"
            >
                Go to NSP Portal
            </Button>
        </Card>
    );
};


// --- MAIN DASHBOARD COMPONENT ---
const Dashboard = () => {
    const { logout, token } = useAuth();
    const navigate = useNavigate();
    const [userEmail, setUserEmail] = useState('User');

    // Fetch user details or use token data to get email/username
    useEffect(() => {
        if (token) {
            // Placeholder: Decode token or fetch user info. Using a mock email for now.
            // In a real app, you'd decode the JWT to get the 'sub' (email)
            setUserEmail(token.substring(0, 10) + '...' + ' (Authenticated)');
        }
    }, [token]);


    const handleLogout = useCallback(() => {
        logout();
        navigate('/login');
    }, [logout, navigate]);

    return (
        <div className="dashboard-page">
            <Navbar className="glass shadow-sm mb-4">
                <Container>
                    <h2 className="fs-4 fw-bold mb-0 accent-text">EduRural AI</h2>
                    <div className="d-flex align-items-center">
                        <span className="me-3 small-muted">Welcome, {userEmail}</span>
                        <Button onClick={handleLogout} variant="danger" size="sm">Log Out</Button>
                    </div>
                </Container>
            </Navbar>

            <Container className="my-5">
                {/* HERO */}
                <header className="mb-4">
                    <Card className="glass shadow-lg p-4">
                        <h1 className="fs-3 fw-bold">Welcome Back!</h1>
                        <p className="small-muted mt-2">Access your protected Agri-Tech and Gen AI tools below.</p>
                    </Card>
                </header>

                {/* MAIN GRID */}
                <Row className="g-4">
                    {/* LEFT: Video Learning Hub (Replaces NotesGenerator) */}
                    <Col lg={6}>
                        <VideoLearningHub />
                    </Col>
                    
                    {/* RIGHT: Agri-Tech & Timetable Generator */}
                    <Col lg={6}>
                        <AgriTechHub />
                        <TimetableGenerator />
                        {/* 👇 NEW FEATURE: Scholarship Portal Button */}
                        <ScholarshipPortalButton />
                    </Col>
                </Row>
            </Container>
        </div>
    );
};

export default Dashboard;