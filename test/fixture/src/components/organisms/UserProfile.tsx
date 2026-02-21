import React, { useContext, useEffect } from 'react';
import UserCard from '../molecules/UserCard';
import { Button } from '../atoms';

/** Displays the full user profile with actions. */
export default function UserProfile() {
  useEffect(() => {
    console.log('UserProfile mounted');
  }, []);

  return (
    <div className="user-profile">
      <UserCard name="Jane" avatarSrc="/avatar.png" notifications={3} />
      <Button onClick={() => {}}>Edit Profile</Button>
    </div>
  );
}
