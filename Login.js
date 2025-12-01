import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';

const API_URL = 'http://localhost:8000';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('Logging in...');

        // 💡 CRITICAL FIX: The FastAPI backend expects Form Data, NOT JSON, 
        // with the keys 'username' and 'password'.
        const formBody = new URLSearchParams({
            username: email, // FastAPI OAuth2 uses 'username' for email lookup
            password: password,
        }).toString();

        try {
            const response = await fetch(`${API_URL}/api/v1/login`, {
                method: 'POST',
                // 💡 Set Content-Type header to match FastAPI's OAuth2 dependency
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded' 
                },
                // 💡 Send the URL-encoded string as the body
                body: formBody,
            });

            const data = await response.json();

            if (response.ok) {
                login(data.access_token); // Store the JWT token
                setMessage('✅ Login successful! Redirecting...');
                setTimeout(() => navigate('/'), 500);
            } else {
                setMessage(`❌ Error: ${data.detail || 'Invalid credentials.'}`);
            }
        } catch (error) {
            setMessage('❌ Network Error. Check if FastAPI backend is running.');
        }
    };

    return (
        <div className="d-flex justify-content-center align-items-center min-vh-100 p-3">
            <Card className="glass shadow w-100" style={{ maxWidth: '450px' }}>
                <Card.Body className="p-4 p-md-5">
                    <h2 className="card-title text-center mb-4 accent-text fw-bold">EduRural Login</h2>
                    <Form onSubmit={handleSubmit}>
                        <Form.Group className="mb-3">
                            <Form.Control
                                type="email"
                                placeholder="Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </Form.Group>
                        <Form.Group className="mb-4">
                            <Form.Control
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </Form.Group>
                        <Button type="submit" className="w-100 btn-grad py-2 fw-semibold" disabled={message.includes('Logging')}>
                            Log In
                        </Button>
                    </Form>
                    <p className="mt-3 text-center small-muted">{message}</p>
                    <p className="mt-3 text-center">
                        Don't have an account? <Link to="/signup" className="accent-text text-decoration-none">Sign Up</Link>
                    </p>
                </Card.Body>
            </Card>
        </div>
    );
};

export default Login;