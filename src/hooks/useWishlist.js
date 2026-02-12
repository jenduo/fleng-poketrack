import { useState, useEffect } from 'react'
import { db } from '../firebase'
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query
} from 'firebase/firestore'

export function useWishlist() {
  const [wishlist, setWishlist] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simple query without ordering (avoids index requirement)
    const q = query(collection(db, 'wishlist'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cardData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      // Sort in JS instead
      cardData.sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''))
      setWishlist(cardData)
      setLoading(false)
    }, (error) => {
      console.error('Error fetching wishlist:', error)
      setWishlist([])
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const addToWishlist = async (card, priority = 'medium', notes = '') => {
    try {
      await addDoc(collection(db, 'wishlist'), {
        ...card,
        priority,
        notes,
        dateAdded: new Date().toISOString()
      })
    } catch (error) {
      console.error('Error adding to wishlist:', error)
      throw error
    }
  }

  const removeFromWishlist = async (cardId) => {
    try {
      await deleteDoc(doc(db, 'wishlist', cardId))
    } catch (error) {
      console.error('Error removing from wishlist:', error)
      throw error
    }
  }

  return {
    wishlist,
    loading,
    addToWishlist,
    removeFromWishlist
  }
}
