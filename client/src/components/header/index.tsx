import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaRegBell } from 'react-icons/fa';
import useHeader from '../../hooks/useHeader';
import './index.css';
import ProfilePicture from '../main/profilePicture';

/**
 * Header component that renders the main title, a search bar and a notifications button.
 * The search bar allows the user to input a query and navigate to the search results page
 * when they press Enter. The notifications button allows the user to navigate to their
 * notifications page.
 */
const Header = () => {
  const { val, handleInputChange, handleKeyDown, userHasUnreadNotifs, user } = useHeader();
  const navigate = useNavigate();

  const handleNotifications = () => {
    navigate('/notifications');
  };

  const handleProfile = () => {
    navigate('/profile/activity');
  };

  return (
    <div id='header' className='header'>
      <div className='headerContents'>
        <div className='logoContainer'>
          <img src='./Short Stack Logo.png' alt='Short Stack Logo' className='shortStackLogo' />
          <div className='title'>ShortStack</div>
        </div>
        <div className='headerButtons'>
          <input
            id='searchBar'
            placeholder='Search for Questions...'
            type='text'
            value={val}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
          />
          <button className='notifications_btn' onClick={handleNotifications}>
            {<FaRegBell size='16px' />}
            {userHasUnreadNotifs() ? <div className='notif_indicator'> </div> : <></>}
          </button>
          <button className='profile_btn' onClick={handleProfile}>
            <ProfilePicture equippedFrame={user.equippedFrame} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Header;
