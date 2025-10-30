document.addEventListener('DOMContentLoaded', () => {
    const eventsContainer = document.getElementById('events-container');
    const createEventForm = document.getElementById('create-event-form');

    // --- Modal Elements ---
    const modal = document.getElementById('add-player-modal');
    const closeModalBtn = document.querySelector('.close-button');
    const addPlayerForm = document.getElementById('add-player-form');
    const modalEventId = document.getElementById('modal-event-id');
    const modalTeeTimeId = document.getElementById('modal-teetime-id');
    const modalPlayerName = document.getElementById('playerName');

    // --- Subscription Elements ---
    const subscribeForm = document.getElementById('subscribe-form');
    const subscribeEmailInput = document.getElementById('subscribeEmail');
    const subscriptionMessage = document.getElementById('subscription-message');

    // --- Main Function to Fetch and Display Events ---
    const loadEvents = async () => {
        try {
            const response = await fetch('/api/events');
            if (!response.ok) throw new Error('Failed to fetch events.');
            
            const events = await response.json();
            eventsContainer.innerHTML = ''; // Clear existing content

            if (events.length === 0) {
                eventsContainer.innerHTML = '<p>No events scheduled yet.</p>';
                return;
            }

            events.forEach(event => {
                const eventElement = document.createElement('article');
                eventElement.className = 'event-card';
                eventElement.setAttribute('data-event-id', event._id);

                const eventDate = new Date(event.date).toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                });

                // Ensure teeTimes are sorted by time before mapping
                const sortedTeeTimes = [...event.teeTimes].sort((a, b) => a.time.localeCompare(b.time));

                let teeTimesHtml = sortedTeeTimes.map(tt => {
                    let playersHtml = tt.players.map(p => `
                        <li class="player-item">
                            ${p.name}
                            <button class="remove-player" data-player-id="${p._id}" data-teetime-id="${tt._id}">×</button>
                        </li>
                    `).join('');

                    // Show "Add Player" button only if spots are open
                    let addPlayerBtn = tt.players.length < 4 ?
                        `<button class="add-player" data-teetime-id="${tt._id}">Add Player +</button>` :
                        `<div class="tee-time-full">Full</div>`;

                    return `
                        <div class="tee-time-slot" data-teetime-id="${tt._id}">
                            <strong>${tt.time}</strong>
                            <button class="remove-teetime" data-teetime-id="${tt._id}">Remove Tee Time</button>
                            <ul class="player-list">${playersHtml}</ul>
                            ${addPlayerBtn}
                        </div>
                    `;
                }).join('');

                eventElement.innerHTML = `
                    <h3>${event.eventName}</h3>
                    <p class="event-details">${event.course} | ${eventDate}</p>
                    <button class="delete-event-btn">Delete Event</button>
                    <div class="tee-time-container">${teeTimesHtml}</div>
                    <button class="add-tee-time-btn">Add New Tee Time</button>
                `;
                eventsContainer.appendChild(eventElement);
            });

        } catch (error) {
            console.error('Error loading events:', error);
            eventsContainer.innerHTML = '<p>Error loading events. Please try again.</p>';
        }
    };

    // --- Event Listeners ---

    // 1. Create Event Form
    createEventForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        
        const eventData = {
            eventName: document.getElementById('eventName').value,
            course: document.getElementById('course').value,
            date: document.getElementById('date').value,
            startTime: document.getElementById('startTime').value,
            numTeeTimes: document.getElementById('numTeeTimes').value
        };

        try {
            const response = await fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to create event.');
            }

            createEventForm.reset(); 
            loadEvents(); // Reload all events
        } catch (error) {
            console.error('Error creating event:', error);
            alert(`Error: ${error.message}`);
        }
    });

    // 2. Click Handling (for all buttons in the events container)
    eventsContainer.addEventListener('click', (e) => {
        const eventCard = e.target.closest('.event-card');
        if (!eventCard) return;
        
        const eventId = eventCard.dataset.eventId;

        // Handle "Add Player" click
        if (e.target.classList.contains('add-player')) {
            const teeTimeId = e.target.dataset.teetimeId;
            openAddPlayerModal(eventId, teeTimeId);
        }

        // Handle "Remove Player" click
        if (e.target.classList.contains('remove-player')) {
            const teeTimeId = e.target.dataset.teetimeId;
            const playerId = e.target.dataset.playerId;
            
            if (confirm('Are you sure you want to remove this player?')) {
                removePlayer(eventId, teeTimeId, playerId);
            }
        }
        
        // Handle "Delete Event" click
        if (e.target.classList.contains('delete-event-btn')) {
            if (confirm(`Are you sure you want to permanently delete this event?`)) {
                deleteEvent(eventId);
            }
        }

        // Handle "Remove Tee Time" click
        if (e.target.classList.contains('remove-teetime')) {
            const teeTimeId = e.target.dataset.teetimeId;
            if (confirm('Are you sure you want to remove this entire tee time slot?')) {
                removeTeeTime(eventId, teeTimeId);
            }
        }

        // Handle "Add New Tee Time" click
        if (e.target.classList.contains('add-tee-time-btn')) {
            const newTime = prompt("Enter the time for the new tee time (e.g., 09:30 AM):");
            if (newTime) {
                addTeeTime(eventId, newTime);
            }
        }
    });

    // 3. Add Player Modal Form
    addPlayerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const eventId = modalEventId.value;
        const teeTimeId = modalTeeTimeId.value;
        const playerName = modalPlayerName.value.trim();

        if (!playerName) return;

        try {
            const response = await fetch(`/api/events/${eventId}/teetimes/${teeTimeId}/add`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerName })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to add player.');
            }

            closeModal();
            loadEvents(); // Reload events to show the new player
        } catch (error) {
            console.error('Error adding player:', error);
            alert(`Error: ${error.message}`);
        }
    });

    // --- Modal Helper Functions ---
    const openAddPlayerModal = (eventId, teeTimeId) => {
        modalEventId.value = eventId;
        modalTeeTimeId.value = teeTimeId;
        modalPlayerName.value = '';
        modal.style.display = 'block';
        modalPlayerName.focus();
    };

    const closeModal = () => {
        modal.style.display = 'none';
    };

    closeModalBtn.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // --- Subscription Form Handler (with page refresh) ---
    if (subscribeForm) {
        subscribeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = subscribeEmailInput.value.trim();

            try {
                const response = await fetch('/api/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.message || 'Failed to subscribe.');
                }

                subscriptionMessage.style.color = 'green';
                subscriptionMessage.textContent = 'Success! You are now subscribed. Refreshing page...';
                
                // Force full page refresh
                setTimeout(() => {
                    window.location.reload(); 
                }, 1000); 

            } catch (error) {
                console.error('Subscription error:', error);
                subscriptionMessage.style.color = 'red';
                subscriptionMessage.textContent = `Error: ${error.message}`;
            }
        });
    }

    // --- API Call Functions ---
    
    // Remove Player
    const removePlayer = async (eventId, teeTimeId, playerId) => {
        try {
            const response = await fetch(`/api/events/${eventId}/teetimes/${teeTimeId}/players/${playerId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to remove player.');
            }
            
            loadEvents(); 
        } catch (error) {
            console.error('Error removing player:', error);
            alert(`Error: ${error.message}`);
        }
    };
    
    // Delete Event
    const deleteEvent = async (eventId) => {
        try {
            const response = await fetch(`/api/events/${eventId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to delete event.');
            }
            
            loadEvents(); 
        } catch (error) {
            console.error('Error deleting event:', error);
            alert(`Error: ${error.message}`);
        }
    };

    // Remove Tee Time
    const removeTeeTime = async (eventId, teeTimeId) => {
        try {
            const response = await fetch(`/api/events/${eventId}/teetimes/${teeTimeId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to remove tee time.');
            }
            
            loadEvents(); 
        } catch (error) {
            console.error('Error removing tee time:', error);
            alert(`Error: ${error.message}`);
        }
    };

    // Add Tee Time
    const addTeeTime = async (eventId, time) => {
        try {
            const response = await fetch(`/api/events/${eventId}/teetimes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ time })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to add new tee time.');
            }
            
            loadEvents(); 
        } catch (error) {
            console.error('Error adding tee time:', error);
            alert(`Error: ${error.message}`);
        }
    };


    // --- Initial Load ---
    loadEvents();
});