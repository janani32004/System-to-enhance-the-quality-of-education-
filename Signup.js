import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';

const API_URL = 'http://localhost:8000';

const Signup = () => {
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage('Processing...');

        try {
            const response = await fetch(`${API_URL}/api/v1/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, username, password }),
            });

            const data = await response.json();

            if (response.ok) {
                setMessage('✅ Signup successful! Redirecting to login...');
                setTimeout(() => navigate('/login'), 1500);
            } else {
                setMessage(`❌ Error: ${data.detail || 'Failed to register.'}`);
            }
        } catch (error) {
            setMessage('❌ Network Error. Check if FastAPI backend is running.');
        }
    };

    return (
        <div className="d-flex align-items-center justify-content-center min-vh-100 bg-light-gray">
            <Card className="glass shadow-lg login-card">
                <Card.Body className="p-4">
                    <h2 className="text-center fw-bold accent-text mb-4">Sign Up</h2>
                    <Form onSubmit={handleSubmit}>
                        <Form.Group className="mb-3">
                            <Form.Control
                                type="text"
                                placeholder="Username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </Form.Group>
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
                        <Button type="submit" className="w-100 btn-grad py-2 fw-semibold" disabled={message.includes('Processing')}>
                            Sign Up
                        </Button>
                    </Form>
                    <p className="mt-3 text-center small-muted">{message}</p>
                    <p className="mt-3 text-center">
                        Already have an account? <Link to="/login" className="accent-text text-decoration-none">Login</Link>
                    </p>
                </Card.Body>
            </Card>
        </div>
    );
};

export default Signup;