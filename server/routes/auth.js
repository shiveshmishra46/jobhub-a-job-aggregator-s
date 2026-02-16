import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import passport from '../config/passport.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// ---------- Google OAuth Routes ----------

// Diagnostic endpoint to check OAuth configuration
router.get('/google/check', (req, res) => {
  res.json({
    status: 'ok',
    client_id_present: Boolean(process.env.GOOGLE_CLIENT_ID),
    client_id_preview: process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...',
    callback_url: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5050/api/auth/google/callback',
    client_url: process.env.CLIENT_URL || 'http://localhost:5173'
  });
});

// Initiate Google OAuth - CRITICAL: Must have scope
router.get(
  '/google',
  (req, res, next) => {
    console.log('🚀 Google OAuth initiated');
    next();
  },
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account',
    accessType: 'offline',
    session: false
  })
);

// Handle Google OAuth callback
router.get(
  '/google/callback',
  (req, res, next) => {
    console.log('📥 Google OAuth callback hit');
    console.log('   Query params:', Object.keys(req.query));
    next();
  },
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=oauth_failed`
  }),
  async (req, res) => {
    try {
      console.log('✅ Google OAuth authentication successful');
      console.log('   User:', req.user?.email);
      
      if (!req.user) {
        console.error('❌ No user object after authentication');
        return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=no_user`);
      }
      
      const token = generateToken(req.user._id);
      const redirectUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/auth/callback?token=${token}`;
      
      console.log('🔄 Redirecting to:', redirectUrl);
      return res.redirect(redirectUrl);
    } catch (error) {
      console.error('❌ Google OAuth callback error:', error);
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=oauth_failed`);
    }
  }
);

// Optional explicit failure route for debugging
router.get('/google/failure', (req, res) => {
  console.error('❌ Google OAuth failure route hit');
  res.status(401).json({ 
    message: 'Google OAuth failed',
    hint: 'Check server logs for details'
  });
});

// ---------- Email/Password Auth Routes ----------

// Register
router.post('/register', [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['student', 'recruiter']).withMessage('Role must be student or recruiter')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const user = new User({ name, email, password, role });
    await user.save();

    const token = generateToken(user._id);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.isLocked) {
      return res.status(423).json({ 
        message: 'Account is locked. Please try again later.' 
      });
    }

    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      await user.incLoginAttempts();
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    user.loginAttempts = 0;
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error while fetching user' });
  }
});

// Update profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const updates = req.body;
    
    if (updates.profile) {
      updates.profile = { ...req.user.profile, ...updates.profile };
    }
    if (updates.company) {
      updates.company = { ...req.user.company, ...updates.company };
    }
    if (updates.preferences) {
      updates.preferences = { ...req.user.preferences, ...updates.preferences };
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'Profile updated successfully',
      user
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error while updating profile' });
  }
});

// Logout (client-side token removal, but endpoint for consistency)
router.post('/logout', authenticateToken, async (req, res) => {
  res.json({ message: 'Logout successful' });
});

export default router;