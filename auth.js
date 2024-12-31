// auth.js
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

const login = (req, res) => {
  const { username, password } = req.body;

  // In a real-world scenario, validate username and password from DB
  if (username === 'admin' && password === 'password') {
    const token = jwt.sign({ username: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
};

module.exports = { login };

