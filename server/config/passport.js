// Ensure env vars are available even if server forgot to call dotenv
import 'dotenv/config';

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';

// Configure Google OAuth Strategy
export function configurePassport() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn('⚠️  Google OAuth disabled: missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment.');
    return; // Do not crash server; manual auth will still work
  }

  console.log('✅ Google OAuth enabled');
  console.log('   Client ID:', GOOGLE_CLIENT_ID?.substring(0, 20) + '...');
  console.log('   Callback URL:', GOOGLE_CALLBACK_URL || 'http://localhost:5050/api/auth/google/callback');

  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL || 'http://localhost:5050/api/auth/google/callback',
        scope: ['profile', 'email'],
        // Force latest API version
        userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo'
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          console.log('🔐 Google OAuth callback received');
          console.log('   Profile ID:', profile.id);
          console.log('   Email:', profile.emails?.[0]?.value);
          
          // Try find by googleId
          let user = await User.findOne({ googleId: profile.id });
          if (user) {
            console.log('✅ Existing user found by Google ID');
            user.lastLogin = new Date();
            await user.save();
            return done(null, user);
          }

          // Try find by email to link existing account
          const email = profile.emails?.[0]?.value;
          if (email) {
            user = await User.findOne({ email });
            if (user) {
              console.log('✅ Existing user found by email - linking Google account');
              user.googleId = profile.id;
              user.isEmailVerified = true;
              user.lastLogin = new Date();
              
              // Update profile picture if not set
              if (!user.profile?.profilePicture && profile.photos?.[0]?.value) {
                user.profile = user.profile || {};
                user.profile.profilePicture = {
                  filename: 'google-profile-pic',
                  contentType: 'image/jpeg'
                };
              }
              
              await user.save();
              return done(null, user);
            }
          }

          // Create a new user
          console.log('✅ Creating new user from Google profile');
          const newUser = new User({
            googleId: profile.id,
            name: profile.displayName || 'Google User',
            email: email,
            role: 'student', // Default role
            isEmailVerified: true,
            lastLogin: new Date(),
            profile: {
              profilePicture: profile.photos?.[0]?.value
                ? { filename: 'google-profile-pic', contentType: 'image/jpeg' }
                : undefined
            }
          });

          await newUser.save();
          console.log('✅ New user created successfully');
          return done(null, newUser);
        } catch (error) {
          console.error('❌ Google strategy error:', error);
          return done(error, null);
        }
      }
    )
  );
}

// Sessions not used but required by passport
passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;