import { useState, useEffect } from 'react'
import { db } from '../firebase'
import {
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  onSnapshot,
  query
} from 'firebase/firestore'

export function useCollection() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simple query without ordering (avoids index requirement)
    const q = query(collection(db, 'collection'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cardData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      // Sort in JS instead
      cardData.sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''))
      setCards(cardData)
      setLoading(false)
    }, (error) => {
      console.error('Error fetching collection:', error)
      setCards([])
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const addCard = async (card) => {
    try {
      await addDoc(collection(db, 'collection'), {
        ...card,
        dateAdded: new Date().toISOString()
      })
    } catch (error) {
      console.error('Error adding card:', error)
      throw error
    }
  }

  const removeCard = async (cardId) => {
    try {
      await deleteDoc(doc(db, 'collection', cardId))
    } catch (error) {
      console.error('Error removing card:', error)
      throw error
    }
  }

  const updateCard = async (cardId, updates) => {
    try {
      await updateDoc(doc(db, 'collection', cardId), updates)
    } catch (error) {
      console.error('Error updating card:', error)
      throw error
    }
  }

  const getTotalValue = () => {
    return cards.reduce((total, card) => {
      const price = card.purchasePrice || card.marketPrice || 0
      const quantity = card.quantity || 1
      return total + (price * quantity)
    }, 0)
  }

  const getTotalCards = () => {
    return cards.reduce((total, card) => total + (card.quantity || 1), 0)
  }

  return {
    cards,
    loading,
    addCard,
    removeCard,
    updateCard,
    getTotalValue,
    getTotalCards
  }
}
