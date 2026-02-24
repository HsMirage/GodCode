import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout/Layout';
import Home from './pages/Home/Home';
import BlackList from './pages/BlackList/BlackList';
import RedList from './pages/RedList/RedList';
import Search from './pages/Search/Search';
import BrandDetail from './pages/BrandDetail/BrandDetail';
import EventDetail from './pages/EventDetail/EventDetail';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import Profile from './pages/Profile/Profile';
import MySubmissions from './pages/Profile/MySubmissions';
import Publish from './pages/Publish/Publish';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="blacklist" element={<BlackList />} />
            <Route path="redlist" element={<RedList />} />
            <Route path="search" element={<Search />} />
            <Route path="brand/:id" element={<BrandDetail />} />
            <Route path="event/:id" element={<EventDetail />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="profile" element={<Profile />} />
            <Route path="my-submissions" element={<MySubmissions />} />
            <Route path="publish" element={<Publish />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;