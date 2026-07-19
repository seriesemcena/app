/* Compatibility entrypoint for older FCM registrations.
   New clients use /sw.js directly so a second root-scope worker cannot replace it. */
importScripts('/sw.js');
