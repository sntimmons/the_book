import { useEffect, useRef, useState } from 'react'
import { View, Image, Animated, StyleSheet, ImageSourcePropType } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

type Props = {
  images: ImageSourcePropType[]
  fallback?: boolean
}

export default function CrossfadeBackground({ images, fallback = false }: Props) {
  const currentOpacity = useRef(new Animated.Value(1))
  const nextOpacity = useRef(new Animated.Value(0))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [nextIndex, setNextIndex] = useState(1)

  useEffect(() => {
    if (fallback || images.length === 0) return

    const interval = setInterval(() => {
      Animated.parallel([
        Animated.timing(currentOpacity.current, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(nextOpacity.current, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentIndex((prev) => {
          const next = (prev + 1) % images.length
          setNextIndex((next + 1) % images.length)
          return next
        })
        currentOpacity.current.setValue(1)
        nextOpacity.current.setValue(0)
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [fallback, images.length])

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#080808' }]} />

      {fallback || images.length === 0 ? (
        <LinearGradient
          colors={['#2A1808', '#1a0e05', '#080808']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <>
          {/* Current image */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: currentOpacity.current }]}>
            <Image
              source={images[currentIndex]}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          </Animated.View>

          {/* Next image */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: nextOpacity.current }]}>
            <Image
              source={images[nextIndex % images.length]}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          </Animated.View>
        </>
      )}

      {/* Dark gradient overlay — always on top */}
      <LinearGradient
        colors={[
          'rgba(8,8,8,0.1)',
          'rgba(8,8,8,0.35)',
          'rgba(8,8,8,0.75)',
          'rgba(8,8,8,0.93)',
          '#080808',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </View>
  )
}
